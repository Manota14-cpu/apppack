"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Dato {
  categoria: string;
  color: string | null;
  unidades: number;
}

const EJE = { fill: "hsl(0 0% 60%)", fontSize: 12, fontWeight: 500 };

export function StockChart({ data }: { data: Dato[] }) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Stock por categoría</CardTitle></CardHeader>
        <CardContent className="flex h-[280px] items-center justify-center">
          <p className="text-caption text-muted-foreground">Sin productos con stock para graficar.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle>Stock por categoría</CardTitle></CardHeader>
      <CardContent className="pt-4">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <XAxis
              dataKey="categoria"
              axisLine={false}
              tickLine={false}
              tick={EJE}
              dy={8}
              interval={0}
              tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)}
            />
            <YAxis axisLine={false} tickLine={false} tick={EJE} width={48} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload as Dato | undefined;
                if (!d) return null;
                return (
                  <div className="glass-strong rounded-xl border px-3.5 py-2.5 shadow-card">
                    <p className="font-mono text-body font-bold tabular-nums">
                      {Number(d.unidades).toLocaleString("es-AR")}
                      <span className="ml-1.5 text-caption font-medium text-muted-foreground">unidades</span>
                    </p>
                    <p className="text-caption text-muted-foreground">{d.categoria}</p>
                  </div>
                );
              }}
            />
            {/* Usa el color real de cada categoría, que ya se guarda en la base. */}
            <Bar dataKey="unidades" radius={[6, 6, 0, 0]} maxBarSize={72}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.color ?? "hsl(0 0% 78%)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
