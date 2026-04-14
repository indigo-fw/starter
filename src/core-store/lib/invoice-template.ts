/**
 * Generate a print-ready HTML invoice for an order.
 * Designed to be opened in a new tab and printed to PDF via browser.
 * No external dependencies — pure HTML + inline CSS.
 */

export interface InvoiceParams {
  orderNumber: string;
  invoiceNumber: string;
  orderDate: string;
  paidAt: string | null;

  // Seller
  sellerName: string;
  sellerAddress: string;
  sellerVatId?: string;

  // Buyer
  buyerName: string;
  buyerAddress: string;
  buyerVatId?: string;

  // Items
  items: Array<{
    name: string;
    variant?: string;
    quantity: number;
    unitPrice: string;
    total: string;
    taxRate?: string;
  }>;

  // Totals
  subtotal: string;
  shipping: string;
  tax: string;
  discount?: string;
  total: string;
  currency: string;

  // Tax details
  taxDetails?: Array<{ name: string; rate: string; amount: string }>;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2br(str: string): string {
  return escapeHtml(str).replace(/\n/g, '<br>');
}

export function generateInvoiceHtml(params: InvoiceParams): string {
  const {
    orderNumber,
    invoiceNumber,
    orderDate,
    paidAt,
    sellerName,
    sellerAddress,
    sellerVatId,
    buyerName,
    buyerAddress,
    buyerVatId,
    items,
    subtotal,
    shipping,
    tax,
    discount,
    total,
    currency,
    taxDetails,
  } = params;

  const itemRows = items
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.name)}${item.variant ? `<br><small class="variant">${escapeHtml(item.variant)}</small>` : ''}</td>
        <td class="right">${item.quantity}</td>
        <td class="right">${escapeHtml(item.unitPrice)}</td>
        <td class="right">${item.taxRate ? escapeHtml(item.taxRate) : '—'}</td>
        <td class="right">${escapeHtml(item.total)}</td>
      </tr>`,
    )
    .join('');

  const taxBreakdownRows = taxDetails
    ?.map(
      (td) => `
      <tr class="subtotal-row">
        <td colspan="4" class="right">${escapeHtml(td.name)} (${escapeHtml(td.rate)})</td>
        <td class="right">${escapeHtml(td.amount)} ${escapeHtml(currency)}</td>
      </tr>`,
    )
    .join('') ?? '';

  const discountRow = discount
    ? `
      <tr class="subtotal-row">
        <td colspan="4" class="right">Discount</td>
        <td class="right">-${escapeHtml(discount)} ${escapeHtml(currency)}</td>
      </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${escapeHtml(invoiceNumber)}</title>
  <style>
    :root {
      --invoice-brand-color: #1a1a2e;
      --invoice-border: #e2e2e8;
      --invoice-bg-muted: #f8f8fa;
      --invoice-text: #1a1a2e;
      --invoice-text-muted: #6b6b80;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      color: var(--invoice-text);
      background: #fff;
      padding: 40px;
      max-width: 210mm;
      margin: 0 auto;
    }

    /* Header */
    .invoice-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid var(--invoice-brand-color);
    }

    .invoice-title {
      font-size: 28px;
      font-weight: 700;
      color: var(--invoice-brand-color);
      letter-spacing: -0.5px;
    }

    .invoice-meta {
      text-align: right;
      font-size: 12px;
      color: var(--invoice-text-muted);
    }

    .invoice-meta strong {
      color: var(--invoice-text);
    }

    .invoice-meta div {
      margin-bottom: 4px;
    }

    /* Parties */
    .parties {
      display: flex;
      gap: 40px;
      margin-bottom: 40px;
    }

    .party {
      flex: 1;
    }

    .party-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--invoice-text-muted);
      margin-bottom: 8px;
      font-weight: 600;
    }

    .party-name {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .party-address {
      color: var(--invoice-text-muted);
      font-size: 12px;
    }

    .party-vat {
      margin-top: 6px;
      font-size: 11px;
      color: var(--invoice-text-muted);
    }

    /* Items table */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }

    .items-table thead th {
      background: var(--invoice-bg-muted);
      border-bottom: 1px solid var(--invoice-border);
      padding: 10px 12px;
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--invoice-text-muted);
      font-weight: 600;
    }

    .items-table thead th.right {
      text-align: right;
    }

    .items-table tbody td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--invoice-border);
      vertical-align: top;
    }

    .items-table .variant {
      color: var(--invoice-text-muted);
      font-size: 11px;
    }

    .items-table .right {
      text-align: right;
    }

    /* Totals */
    .subtotal-row td {
      border-bottom: none !important;
      padding-top: 6px;
      padding-bottom: 6px;
      font-size: 12px;
      color: var(--invoice-text-muted);
    }

    .total-row td {
      border-top: 2px solid var(--invoice-brand-color);
      border-bottom: none !important;
      padding-top: 12px;
      font-size: 16px;
      font-weight: 700;
      color: var(--invoice-brand-color);
    }

    /* Footer */
    .invoice-footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid var(--invoice-border);
      font-size: 11px;
      color: var(--invoice-text-muted);
      text-align: center;
    }

    /* Print styles */
    @media print {
      body {
        padding: 0;
        font-size: 12px;
      }

      @page {
        size: A4;
        margin: 15mm 20mm;
      }

      .invoice-header {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .items-table thead th {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="invoice-header">
    <div>
      <div class="invoice-title">INVOICE</div>
    </div>
    <div class="invoice-meta">
      <div><strong>${escapeHtml(invoiceNumber)}</strong></div>
      <div>Order: ${escapeHtml(orderNumber)}</div>
      <div>Date: ${escapeHtml(orderDate)}</div>
      ${paidAt ? `<div>Paid: ${escapeHtml(paidAt)}</div>` : '<div>Status: Unpaid</div>'}
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-label">From</div>
      <div class="party-name">${escapeHtml(sellerName)}</div>
      <div class="party-address">${nl2br(sellerAddress)}</div>
      ${sellerVatId ? `<div class="party-vat">VAT ID: ${escapeHtml(sellerVatId)}</div>` : ''}
    </div>
    <div class="party">
      <div class="party-label">Bill To</div>
      <div class="party-name">${escapeHtml(buyerName)}</div>
      <div class="party-address">${nl2br(buyerAddress)}</div>
      ${buyerVatId ? `<div class="party-vat">VAT ID: ${escapeHtml(buyerVatId)}</div>` : ''}
    </div>
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th>Item</th>
        <th class="right">Qty</th>
        <th class="right">Unit Price</th>
        <th class="right">Tax</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
      <tr class="subtotal-row">
        <td colspan="4" class="right">Subtotal</td>
        <td class="right">${escapeHtml(subtotal)} ${escapeHtml(currency)}</td>
      </tr>
      <tr class="subtotal-row">
        <td colspan="4" class="right">Shipping</td>
        <td class="right">${escapeHtml(shipping)} ${escapeHtml(currency)}</td>
      </tr>
      ${taxBreakdownRows}
      ${!taxBreakdownRows ? `
      <tr class="subtotal-row">
        <td colspan="4" class="right">Tax</td>
        <td class="right">${escapeHtml(tax)} ${escapeHtml(currency)}</td>
      </tr>
      ` : ''}
      ${discountRow}
      <tr class="total-row">
        <td colspan="4" class="right">Total</td>
        <td class="right">${escapeHtml(total)} ${escapeHtml(currency)}</td>
      </tr>
    </tbody>
  </table>

  <div class="invoice-footer">
    <p>Thank you for your business.</p>
  </div>
</body>
</html>`;
}
