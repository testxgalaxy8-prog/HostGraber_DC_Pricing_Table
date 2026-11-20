import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ALL_BILLING_CYCLES,
  CYCLE_META,
  formatCurrencyValue,
  formatTenureSelectionLabel,
  getPricingItem,
  hasPricingValue,
  resolvePricingBreakdown,
  resolveTargetCycles,
  type TenureSelection,
} from '../shared/quotation.ts';
import type {
  HostingPlanFull,
  PlanPricingItem,
  PortalSettings,
} from '../shared/types.ts';

let cachedFontBase64: { regular: string; bold: string } | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function loadDejaVuFonts(): Promise<{ regular: string; bold: string } | null> {
  if (cachedFontBase64) return cachedFontBase64;
  try {
    const [regRes, boldRes] = await Promise.all([
      fetch('/fonts/DejaVuSans.ttf'),
      fetch('/fonts/DejaVuSans-Bold.ttf'),
    ]);
    if (!regRes.ok || !boldRes.ok) return null;
    const [regBuf, boldBuf] = await Promise.all([
      regRes.arrayBuffer(),
      boldRes.arrayBuffer(),
    ]);
    cachedFontBase64 = {
      regular: arrayBufferToBase64(regBuf),
      bold: arrayBufferToBase64(boldBuf),
    };
    return cachedFontBase64;
  } catch {
    return null;
  }
}

async function rasterizeLogoToPng(
  logoUrl: string | null | undefined
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (!logoUrl) return null;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      if (!logoUrl.startsWith('data:')) {
        el.crossOrigin = 'anonymous';
      }
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Logo image load error'));
      el.src = logoUrl;
    });

    const naturalW = img.naturalWidth || 160;
    const naturalH = img.naturalHeight || 48;
    const scale = Math.min(240 / naturalW, 80 / naturalH, 2);
    const w = Math.max(16, Math.round(naturalW * scale));
    const h = Math.max(16, Math.round(naturalH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: w,
      height: h,
    };
  } catch {
    return null;
  }
}

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function makeExportSlug(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'quote'
  );
}

function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatMoney(
  amount: number | null | undefined,
  settings: PortalSettings,
  unicodeSafe: boolean
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount) || amount <= 0) {
    return '—';
  }
  const symbol = unicodeSafe
    ? settings.currencySymbol || '₹'
    : settings.currencySymbol === '₹'
      ? 'INR '
      : settings.currencySymbol || `${settings.currencyCode} `;
  return formatCurrencyValue(amount, symbol, settings.currencyCode);
}

function resolveTaxDisplayLabel(
  item: PlanPricingItem | undefined,
  plan: HostingPlanFull,
  settings: PortalSettings
): string {
  const mode =
    item && item.taxMode !== 'default'
      ? item.taxMode
      : plan.taxDisplayOverride !== 'default'
        ? plan.taxDisplayOverride
        : settings.defaultTaxDisplay;
  return mode === 'inclusive_of_tax' ? 'Inclusive of tax' : 'Before tax';
}

function buildTenureSlug(tenureSelection: TenureSelection): string {
  const cycles = resolveTargetCycles(tenureSelection);
  if (cycles.length === ALL_BILLING_CYCLES.length) return 'all-tenures';
  return cycles.join('-');
}

export function exportPlansToCsv(
  plans: HostingPlanFull[],
  settings: PortalSettings,
  tenureSelection: TenureSelection,
  contextLabel?: string
): void {
  if (plans.length === 0) return;

  const targetCycles = resolveTargetCycles(tenureSelection);

  const headers: string[] = [
    'Plan Name',
    'Series',
    'Category',
    'Base Monthly Price',
    'Tax Mode',
  ];

  for (const cycle of targetCycles) {
    const title = CYCLE_META[cycle].title;
    headers.push(`${title} Monthly Rate (${settings.currencyCode})`);
    headers.push(`${title} Term Total (${settings.currencyCode})`);
    headers.push(`${title} Incl. GST (${settings.currencyCode})`);
  }

  headers.push('Specifications', 'Special Offers', 'Short Description', 'Notes');

  const rows: string[][] = [headers];

  for (const plan of plans) {
    const hasPlanSeries = Boolean(plan.series && plan.series.trim());
    const specsText = [...plan.specifications]
      .filter((s) => {
        if (!s.label.trim() || !s.value.trim()) return false;
        if (
          hasPlanSeries &&
          (s.specKey === 'series' || s.label.trim().toLowerCase() === 'series')
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => `${s.label.trim()}: ${s.value.trim()}`)
      .join(' | ');

    const offersText = [...plan.offers]
      .filter((o) => o.isActive && o.title.trim())
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((o) => {
        if (o.marketValue && o.marketValue > 0) {
          return `${o.title} (${formatMoney(o.marketValue, settings, true)})`;
        }
        return o.title;
      })
      .join(' | ');

    const firstPricing = targetCycles
      .map((c) => getPricingItem(plan.pricing, c))
      .find((p) => hasPricingValue(p));

    const row: string[] = [
      plan.name,
      plan.series || '',
      plan.categoryName,
      plan.baseMonthlyPrice !== null && plan.baseMonthlyPrice > 0
        ? String(plan.baseMonthlyPrice)
        : '',
      resolveTaxDisplayLabel(firstPricing, plan, settings),
    ];

    for (const cycle of targetCycles) {
      const entry = getPricingItem(plan.pricing, cycle);
      const breakdown = resolvePricingBreakdown(entry, cycle, plan, settings);

      row.push(
        breakdown.monthlyRate !== null && breakdown.monthlyRate > 0
          ? String(breakdown.monthlyRate)
          : ''
      );
      row.push(
        breakdown.termTotal !== null && breakdown.termTotal > 0
          ? String(breakdown.termTotal)
          : ''
      );
      row.push(
        breakdown.gstTotal !== null && breakdown.gstTotal > 0
          ? String(breakdown.gstTotal)
          : ''
      );
    }

    row.push(
      specsText,
      offersText,
      plan.shortDescription || '',
      plan.notes || ''
    );

    rows.push(row);
  }

  const csvBody = rows
    .map((r) => r.map((cell) => escapeCsvCell(cell)).join(','))
    .join('\r\n');

  const blob = new Blob([`\uFEFF${csvBody}`], {
    type: 'text/csv;charset=utf-8;',
  });

  const dateStamp = new Date().toISOString().slice(0, 10);
  const slug =
    plans.length === 1
      ? makeExportSlug(plans[0].name)
      : makeExportSlug(contextLabel || 'hosting-quote');
  const tenureSlug = buildTenureSlug(tenureSelection);
  triggerFileDownload(blob, `${slug}-${tenureSlug}-${dateStamp}.csv`);
}

export async function exportPlansToPdf(
  plans: HostingPlanFull[],
  settings: PortalSettings,
  tenureSelection: TenureSelection,
  contextLabel?: string
): Promise<void> {
  if (plans.length === 0) return;

  const targetCycles = resolveTargetCycles(tenureSelection);
  const useLandscape = plans.length > 1 && targetCycles.length >= 3;
  const doc = new jsPDF({
    orientation: useLandscape ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const [fonts, logoAsset] = await Promise.all([
    loadDejaVuFonts(),
    rasterizeLogoToPng(settings.logoUrl),
  ]);

  let fontFamily = 'helvetica';
  let unicodeSafe = false;

  if (fonts) {
    try {
      doc.addFileToVFS('DejaVuSans.ttf', fonts.regular);
      doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.bold);
      doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
      doc.addFont('DejaVuSans-Bold.ttf', 'DejaVuSans', 'bold');
      doc.setFont('DejaVuSans', 'normal');
      fontFamily = 'DejaVuSans';
      unicodeSafe = true;
    } catch {
      fontFamily = 'helvetica';
      unicodeSafe = false;
    }
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 36;

  // Header Banner
  doc.setFillColor(20, 24, 31); // #14181F
  doc.rect(0, 0, pageWidth, 74, 'F');
  doc.setFillColor(23, 201, 100); // #17C964 emerald accent strip
  doc.rect(0, 74, pageWidth, 3, 'F');

  let titleStartX = marginX;
  if (logoAsset) {
    const maxLogoH = 34;
    const maxLogoW = 110;
    const ratio = Math.min(maxLogoW / logoAsset.width, maxLogoH / logoAsset.height);
    const drawW = logoAsset.width * ratio;
    const drawH = logoAsset.height * ratio;
    doc.addImage(logoAsset.dataUrl, 'PNG', marginX, 20 + (maxLogoH - drawH) / 2, drawW, drawH);
    titleStartX = marginX + drawW + 12;
  }

  const companyName = settings.companyName || 'HostGraber';
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  if (!logoAsset || settings.logoShowCompanyName) {
    doc.text(companyName, titleStartX, 34);
  }

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(
    settings.companyWebsite || 'Pricing Quotation',
    !logoAsset || settings.logoShowCompanyName ? titleStartX : marginX + 0,
    !logoAsset || settings.logoShowCompanyName ? 50 : 62
  );

  // Right-aligned Quote Metadata
  const tenureLabel = formatTenureSelectionLabel(targetCycles);
  const generatedStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(12);
  doc.setTextColor(23, 201, 100);
  doc.text(
    plans.length === 1 ? 'PLAN QUOTATION' : 'HOSTING QUOTATION',
    pageWidth - marginX,
    32,
    { align: 'right' }
  );

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Scope: ${tenureLabel}  |  Plans: ${plans.length}  |  Date: ${generatedStr}`,
    pageWidth - marginX,
    50,
    { align: 'right' }
  );

  let cursorY = 98;

  if (plans.length === 1) {
    const plan = plans[0];

    // Plan Heading
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(15);
    doc.setTextColor(15, 23, 42);
    doc.text(plan.name, marginX, cursorY);

    cursorY += 16;
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(5, 150, 105);
    doc.text(
      `${plan.categoryName}${plan.series ? `  ·  ${plan.series}` : ''}`,
      marginX,
      cursorY
    );

    if (plan.shortDescription) {
      cursorY += 16;
      doc.setFontSize(9.5);
      doc.setTextColor(71, 85, 105);
      const wrapped = doc.splitTextToSize(
        plan.shortDescription,
        pageWidth - marginX * 2
      ) as string[];
      doc.text(wrapped, marginX, cursorY);
      cursorY += wrapped.length * 12;
    }

    cursorY += 14;

    // Billing Tenures Table
    const pricingRows = targetCycles.map((cycle) => {
      const item = getPricingItem(plan.pricing, cycle);
      const meta = CYCLE_META[cycle];
      if (!hasPricingValue(item) || !item) {
        return [meta.title, meta.durationLabel, '—', '—', '—', '—'];
      }
      const breakdown = resolvePricingBreakdown(item, cycle, plan, settings);
      return [
        meta.title,
        meta.durationLabel,
        breakdown.monthlyRate !== null && breakdown.monthlyRate > 0
          ? `${formatMoney(breakdown.monthlyRate, settings, unicodeSafe)}/mo`
          : '—',
        formatMoney(breakdown.termTotal, settings, unicodeSafe),
        formatMoney(breakdown.gstTotal, settings, unicodeSafe),
        resolveTaxDisplayLabel(item, plan, settings),
      ];
    });

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Billing Tenures & Pricing', marginX, cursorY);
    cursorY += 8;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      head: [
        ['Billing Cycle', 'Duration', 'Monthly Rate', 'Term Total', 'Incl. GST', 'Tax Mode'],
      ],
      body: pricingRows,
      styles: {
        font: fontFamily,
        fontSize: 9,
        cellPadding: 6,
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240],
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: [248, 250, 252],
        textColor: [51, 65, 85],
        fontStyle: 'bold',
      },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
    });

    cursorY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY) + 20;

    // Technical Specifications Table
    const hasPlanSeries = Boolean(plan.series && plan.series.trim());
    const specs = [...plan.specifications]
      .filter((s) => {
        if (!s.label.trim() || !s.value.trim()) return false;
        if (
          hasPlanSeries &&
          (s.specKey === 'series' || s.label.trim().toLowerCase() === 'series')
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);

    if (specs.length > 0) {
      if (cursorY > pageHeight - 120) {
        doc.addPage();
        cursorY = 42;
      }
      doc.setFont(fontFamily, 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('Technical Specifications', marginX, cursorY);
      cursorY += 8;

      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: marginX },
        head: [['Specification', 'Value']],
        body: specs.map((s) => [s.label.trim(), s.value.trim()]),
        styles: {
          font: fontFamily,
          fontSize: 9,
          cellPadding: 6,
          textColor: [15, 23, 42],
          lineColor: [226, 232, 240],
          lineWidth: 0.5,
        },
        headStyles: {
          fillColor: [248, 250, 252],
          textColor: [51, 65, 85],
          fontStyle: 'bold',
        },
        columnStyles: {
          0: { cellWidth: 190, textColor: [71, 85, 105] },
        },
      });

      cursorY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY) + 20;
    }

    // Active Offers
    const offers = [...plan.offers]
      .filter((o) => o.isActive && o.title.trim())
      .sort((a, b) => a.sortOrder - b.sortOrder);

    if (offers.length > 0) {
      if (cursorY > pageHeight - 100) {
        doc.addPage();
        cursorY = 42;
      }
      doc.setFont(fontFamily, 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('Included Offers', marginX, cursorY);
      cursorY += 8;

      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: marginX },
        head: [['Offer', 'Notes', 'Value']],
        body: offers.map((o) => [
          o.title,
          o.description || '—',
          o.marketValue && o.marketValue > 0
            ? formatMoney(o.marketValue, settings, unicodeSafe)
            : 'Included',
        ]),
        styles: {
          font: fontFamily,
          fontSize: 9,
          cellPadding: 6,
          textColor: [15, 23, 42],
          lineColor: [226, 232, 240],
          lineWidth: 0.5,
        },
        headStyles: {
          fillColor: [248, 250, 252],
          textColor: [51, 65, 85],
          fontStyle: 'bold',
        },
        columnStyles: {
          2: { halign: 'right' },
        },
      });

      cursorY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY) + 18;
    }

    if (plan.notes || plan.termsAndConditions) {
      if (cursorY > pageHeight - 90) {
        doc.addPage();
        cursorY = 42;
      }
      doc.setFont(fontFamily, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('Notes & Terms', marginX, cursorY);
      cursorY += 14;
      doc.setFont(fontFamily, 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      const noteText = [plan.notes, plan.termsAndConditions].filter(Boolean).join('\n\n');
      const wrapped = doc.splitTextToSize(noteText, pageWidth - marginX * 2) as string[];
      doc.text(wrapped, marginX, cursorY);
    }
  } else if (targetCycles.length === 1) {
    // Multi-plan Portrait for a single selected billing tenure
    const selectedCycle = targetCycles[0];
    const meta = CYCLE_META[selectedCycle];
    if (contextLabel) {
      doc.setFont(fontFamily, 'bold');
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(`${contextLabel} — ${meta.title}`, marginX, cursorY);
      cursorY += 10;
    }

    const bodyRows = plans.map((plan) => {
      const topSpecs = [...plan.specifications]
        .filter((s) => s.specKey !== 'series' && s.label.trim() && s.value.trim())
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .slice(0, 5)
        .map((s) => `${s.label}: ${s.value}`)
        .join(' · ');

      const entry = getPricingItem(plan.pricing, selectedCycle);
      const breakdown = resolvePricingBreakdown(entry, selectedCycle, plan, settings);
      return [
        plan.series ? `${plan.name}\n(${plan.series})` : plan.name,
        plan.categoryName,
        topSpecs || '—',
        breakdown.monthlyRate !== null && breakdown.monthlyRate > 0
          ? `${formatMoney(breakdown.monthlyRate, settings, unicodeSafe)}/mo`
          : '—',
        formatMoney(breakdown.termTotal, settings, unicodeSafe),
        formatMoney(breakdown.gstTotal, settings, unicodeSafe),
      ];
    });

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      head: [
        [
          'Plan',
          'Category',
          'Specifications',
          `${meta.title} /mo`,
          `${meta.title} Total`,
          'Incl. GST',
        ],
      ],
      body: bodyRows,
      styles: {
        font: fontFamily,
        fontSize: 8.5,
        cellPadding: 6,
        valign: 'top',
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240],
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: [248, 250, 252],
        textColor: [51, 65, 85],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 96, fontStyle: 'bold' },
        1: { cellWidth: 80 },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
      },
    });
  } else {
    // Multi-plan Matrix for the selected 2..6 tenures
    if (contextLabel) {
      doc.setFont(fontFamily, 'bold');
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(`${contextLabel} — ${tenureLabel}`, marginX, cursorY);
      cursorY += 10;
    }

    const bodyRows = plans.map((plan) => {
      const topSpecs = [...plan.specifications]
        .filter((s) => s.specKey !== 'series' && s.label.trim() && s.value.trim())
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .slice(0, 4)
        .map((s) => `${s.label}: ${s.value}`)
        .join('\n');

      const priceCells = targetCycles.map((cycle) => {
        const entry = getPricingItem(plan.pricing, cycle);
        if (!hasPricingValue(entry) || !entry) return '—';
        const breakdown = resolvePricingBreakdown(entry, cycle, plan, settings);
        const parts: string[] = [];
        if (breakdown.monthlyRate !== null && breakdown.monthlyRate > 0) {
          parts.push(`${formatMoney(breakdown.monthlyRate, settings, unicodeSafe)}/mo`);
        }
        if (breakdown.termTotal !== null && breakdown.termTotal > 0) {
          parts.push(`Total: ${formatMoney(breakdown.termTotal, settings, unicodeSafe)}`);
        }
        if (breakdown.gstTotal !== null && breakdown.gstTotal > 0) {
          parts.push(`GST: ${formatMoney(breakdown.gstTotal, settings, unicodeSafe)}`);
        }
        return parts.join('\n') || '—';
      });

      return [
        plan.series ? `${plan.name}\n(${plan.series})` : plan.name,
        plan.categoryName,
        topSpecs || '—',
        ...priceCells,
      ];
    });

    const columnStyles: Record<number, { cellWidth?: number; fontStyle?: 'bold'; halign?: 'right' }> = {
      0: { cellWidth: useLandscape ? 88 : 82, fontStyle: 'bold' },
      1: { cellWidth: useLandscape ? 74 : 68 },
      2: { cellWidth: useLandscape ? 120 : 110 },
    };
    for (let i = 0; i < targetCycles.length; i++) {
      columnStyles[3 + i] = { halign: 'right' };
    }

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      head: [
        [
          'Plan',
          'Category',
          'Key Specs',
          ...targetCycles.map((c) => CYCLE_META[c].title),
        ],
      ],
      body: bodyRows,
      styles: {
        font: fontFamily,
        fontSize: targetCycles.length >= 4 ? 7.5 : 8.5,
        cellPadding: targetCycles.length >= 4 ? 5 : 6,
        valign: 'top',
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240],
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: [248, 250, 252],
        textColor: [51, 65, 85],
        fontStyle: 'bold',
      },
      columnStyles,
    });
  }

  // Page numbers & clean footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, ph - 32, pw - marginX, ph - 32);
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${companyName} · Currency: ${settings.currencyCode} (${settings.defaultTaxDisplay === 'inclusive_of_tax' ? 'Inclusive of tax' : 'Before tax'})`,
      marginX,
      ph - 18
    );
    doc.text(`Page ${i} of ${totalPages}`, pw - marginX, ph - 18, { align: 'right' });
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  const slug =
    plans.length === 1
      ? makeExportSlug(plans[0].name)
      : makeExportSlug(contextLabel || 'hosting-quote');
  const tenureSlug = buildTenureSlug(tenureSelection);
  doc.save(`${slug}-${tenureSlug}-${dateStamp}.pdf`);
}
