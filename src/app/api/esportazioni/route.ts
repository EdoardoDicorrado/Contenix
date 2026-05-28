import { NextRequest, NextResponse } from "next/server";
import { listInvoicesForExport } from "@/lib/db/queries/invoices";
import { listMovements } from "@/lib/db/queries/movements";
import { buildCsv, formatDateIt, type CsvRow } from "@/lib/csv-export";

function parsePeriod(searchParams: URLSearchParams): { from: Date; to: Date; label: string } | null {
  const period = searchParams.get("period") ?? "month";
  const year = parseInt(searchParams.get("year") ?? "", 10);
  if (!year || year < 2000 || year > 2100) return null;

  if (period === "year") {
    return {
      from: new Date(Date.UTC(year, 0, 1)),
      to: new Date(Date.UTC(year + 1, 0, 1)),
      label: `anno-${year}`,
    };
  }

  if (period === "quarter") {
    const q = parseInt(searchParams.get("quarter") ?? "", 10);
    if (!q || q < 1 || q > 4) return null;
    const startMonth = (q - 1) * 3;
    return {
      from: new Date(Date.UTC(year, startMonth, 1)),
      to: new Date(Date.UTC(year, startMonth + 3, 1)),
      label: `Q${q}-${year}`,
    };
  }

  // month (default)
  const month = parseInt(searchParams.get("month") ?? "", 10);
  if (!month || month < 1 || month > 12) return null;
  return {
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 1)),
    label: `${year}-${String(month).padStart(2, "0")}`,
  };
}

function csvResponse(csv: string, filename: string): NextResponse {
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

const DOC_TYPE_LABEL: Record<string, string> = {
  TD01: "Fattura",
  TD02: "Acconto fattura",
  TD03: "Acconto parcella",
  TD04: "Nota di credito",
  TD05: "Nota di debito",
  TD06: "Parcella",
  TD07: "Fattura semplificata",
  TD08: "Nota credito semplificata",
  TD16: "Integrazione reverse charge",
  TD17: "Integrazione acquisto servizi estero",
  TD18: "Integrazione acquisto beni intracomunitari",
  TD19: "Integrazione acquisto beni art. 17",
  TD20: "Autofattura",
  TD24: "Fattura differita",
  TD25: "Fattura differita art. 21",
  TD26: "Cessione beni ammortizzabili",
  TD27: "Fattura per autoconsumo",
  TD28: "Acquisti da San Marino",
};

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind"); // "vendite" | "acquisti" | "movimenti"
  const period = parsePeriod(sp);

  if (!kind || !period) {
    return NextResponse.json(
      { error: "Parametri mancanti: kind (vendite/acquisti/movimenti), year, month/quarter o period=year" },
      { status: 400 },
    );
  }

  if (kind === "vendite" || kind === "acquisti") {
    const type = kind === "vendite" ? "sale" : "purchase";
    const list = await listInvoicesForExport({ from: period.from, to: period.to, type });

    const headers = [
      "Data emissione",
      "Numero",
      "Tipo documento",
      "Controparte",
      "Partita IVA",
      "Imponibile",
      "IVA",
      "Totale",
      "Valuta",
      "Stato",
      "Data scadenza",
      "IBAN",
      "Nota di credito",
      "Descrizione",
    ];

    const rows: CsvRow[] = list.map((inv) => {
      const total = parseFloat(inv.totalAmount);
      const vat = inv.vatAmount ? parseFloat(inv.vatAmount) : null;
      const taxable = vat !== null ? total - vat : total;
      const sign = inv.isCreditNote ? -1 : 1;
      return [
        formatDateIt(inv.issueDate),
        inv.number,
        inv.documentType
          ? `${inv.documentType} - ${DOC_TYPE_LABEL[inv.documentType] ?? ""}`.trim()
          : (inv.isCreditNote ? "Nota di credito" : "Fattura"),
        inv.counterpartyName,
        inv.counterpartyVat ?? "",
        taxable * sign,
        vat !== null ? vat * sign : null,
        total * sign,
        inv.currency,
        inv.status,
        formatDateIt(inv.dueDate),
        inv.paymentIban ?? "",
        inv.isCreditNote ? "Sì" : "",
        inv.description ?? "",
      ];
    });

    const csv = buildCsv(headers, rows);
    return csvResponse(csv, `registro-iva-${kind}-${period.label}.csv`);
  }

  if (kind === "movimenti") {
    const movements = await listMovements({ from: period.from, to: period.to });

    const headers = ["Data", "Tipo", "Descrizione", "Categoria", "Dipendente", "Importo"];
    const rows: CsvRow[] = movements.map((m) => {
      const amount = parseFloat(m.amount);
      const signedAmount = m.type === "income" ? amount : -amount;
      return [
        formatDateIt(m.date),
        m.type === "income" ? "Entrata" : "Uscita",
        m.description,
        m.categoryName ?? "",
        m.employeeFirstName ? `${m.employeeLastName} ${m.employeeFirstName}` : "",
        signedAmount,
      ];
    });

    const csv = buildCsv(headers, rows);
    return csvResponse(csv, `movimenti-${period.label}.csv`);
  }

  return NextResponse.json({ error: "kind non valido" }, { status: 400 });
}
