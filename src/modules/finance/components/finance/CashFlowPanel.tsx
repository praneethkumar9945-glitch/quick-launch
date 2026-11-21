import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/modules/finance/components/ui/table";
import {
  SectionCard,
  SerialNumberCell,
  SerialNumberHead,
  StatCard,
  StatGrid,
} from "@/modules/finance/components/finance/common";
import { useFinance } from "@/modules/finance/finance/store";
import { chartColors } from "@/modules/finance/finance/chartColors";
import { formatINR, sum, TODAY } from "@/modules/finance/finance/logic";

/** The Cash Flow view, reused as-is as the second tab of Financial Reports. */
export function CashFlowPanel() {
  const { payments, transactions, balances } = useFinance();
  const currentMonth = TODAY.slice(0, 7);
  const data = useMemo(() => {
    const months = new Map<string, { inflow: number; outflow: number }>();
    const bump = (date: string, key: "inflow" | "outflow", amount: number) => {
      const month = date.slice(0, 7);
      const row = months.get(month) ?? { inflow: 0, outflow: 0 };
      row[key] += amount;
      months.set(month, row);
    };
    payments.forEach((payment) => bump(payment.date, "inflow", payment.amount));
    transactions.forEach((transaction) =>
      bump(
        transaction.date,
        transaction.type === "income" ? "inflow" : "outflow",
        transaction.amount,
      ),
    );
    const rows = [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, row]) => ({
        monthKey: month,
        month: new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", {
          month: "short",
          year: "2-digit",
        }),
        inflow: row.inflow,
        outflow: row.outflow,
        net: row.inflow - row.outflow,
        balance: 0,
      }));
    let closing = balances.cash + balances.bank;
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index]!;
      row.balance = closing;
      closing -= row.net;
    }
    return rows;
  }, [balances.bank, balances.cash, payments, transactions]);
  const inflows = sum(data.map((row) => row.inflow));
  const outflows = sum(data.map((row) => row.outflow));
  const netRecordedFlow = inflows - outflows;
  const balanceColumnLabel = data.some((row) => row.monthKey > currentMonth)
    ? "Projected balance"
    : "Closing balance";
  return (
    <>
      <StatGrid className="mb-4">
        <StatCard label="Cash balance" value={formatINR(balances.cash)} />
        <StatCard label="Bank balance" value={formatINR(balances.bank)} />
        <StatCard label="Net recorded flow" value={formatINR(netRecordedFlow)} />
      </StatGrid>
      <SectionCard
        title="Monthly cash flow"
        subtitle="Inflows vs outflows by month"
        className="mb-4"
      >
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid
                strokeDasharray="4 4"
                strokeOpacity={0.6}
                stroke="var(--border)"
                vertical={false}
              />
              <XAxis
                axisLine={false}
                dataKey="month"
                fontSize={12}
                tickLine={false}
                stroke="var(--muted-foreground)"
              />
              <YAxis
                axisLine={false}
                fontSize={12}
                tickLine={false}
                stroke="var(--muted-foreground)"
                tickFormatter={(value: number) => `₹${Math.round(value / 1000)}k`}
              />
              <Tooltip formatter={(value) => formatINR(Number(value))} />
              <Legend
                verticalAlign="bottom"
                iconType="square"
                iconSize={10}
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              />
              <Bar
                dataKey="inflow"
                name="Inflows"
                fill={chartColors.inflows}
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="outflow"
                name="Outflows"
                fill={chartColors.outflows}
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>
      <SectionCard title="Monthly summary">
        <Table>
          <TableHeader>
            <TableRow>
              <SerialNumberHead />
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Inflows</TableHead>
              <TableHead className="text-right">Outflows</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead className="text-right">{balanceColumnLabel}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, index) => (
              <TableRow key={row.month}>
                <SerialNumberCell index={index} />
                <TableCell className="font-medium">{row.month}</TableCell>
                <TableCell className="num text-right">{formatINR(row.inflow)}</TableCell>
                <TableCell className="num text-right">{formatINR(row.outflow)}</TableCell>
                <TableCell className="num text-right">{formatINR(row.net)}</TableCell>
                <TableCell className="num text-right font-medium">
                  {formatINR(row.balance)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-3 text-sm text-muted-foreground">Closing balance = cash + bank.</p>
      </SectionCard>
    </>
  );
}
