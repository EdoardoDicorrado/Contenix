"use client";

import { useState } from "react";
import { Download, ArrowUpRight, ArrowDownLeft, ArrowLeftRight } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR - i);

type Period = "month" | "quarter" | "year";

export function ExportClient() {
  const [period, setPeriod] = useState<Period>("month");
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [quarter, setQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1);

  function buildUrl(kind: "vendite" | "acquisti" | "movimenti"): string {
    const params = new URLSearchParams();
    params.set("kind", kind);
    params.set("year", String(year));
    params.set("period", period);
    if (period === "month") params.set("month", String(month));
    if (period === "quarter") params.set("quarter", String(quarter));
    return `/api/esportazioni?${params.toString()}`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seleziona periodo</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label>Tipo periodo</Label>
            <Select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              <option value="month">Mensile</option>
              <option value="quarter">Trimestrale</option>
              <option value="year">Annuale</option>
            </Select>
          </div>

          <div>
            <Label>Anno</Label>
            <Select value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))}>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>

          {period === "month" && (
            <div>
              <Label>Mese</Label>
              <Select value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))}>
                {MONTHS.map((m, i) => (
                  <option key={i + 1} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {period === "quarter" && (
            <div>
              <Label>Trimestre</Label>
              <Select value={quarter} onChange={(e) => setQuarter(parseInt(e.target.value, 10))}>
                <option value={1}>1° trimestre (gen-mar)</option>
                <option value={2}>2° trimestre (apr-giu)</option>
                <option value={3}>3° trimestre (lug-set)</option>
                <option value={4}>4° trimestre (ott-dic)</option>
              </Select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
          <ExportButton
            href={buildUrl("vendite")}
            label="Registro vendite"
            description="Fatture emesse"
            icon={<ArrowUpRight className="h-4 w-4 text-success" />}
          />
          <ExportButton
            href={buildUrl("acquisti")}
            label="Registro acquisti"
            description="Fatture ricevute"
            icon={<ArrowDownLeft className="h-4 w-4 text-danger" />}
          />
          <ExportButton
            href={buildUrl("movimenti")}
            label="Movimenti bancari"
            description="Estratto conto"
            icon={<ArrowLeftRight className="h-4 w-4 text-muted-foreground" />}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ExportButton({
  href,
  label,
  description,
  icon,
}: {
  href: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <a href={href} download className="block">
      <div className="rounded-md border border-border bg-background hover:bg-muted/30 transition-colors px-4 py-3 cursor-pointer">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {icon}
              <span className="text-sm font-medium text-foreground">{label}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
          </div>
          <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
        </div>
      </div>
    </a>
  );
}
