import { Link } from "@tanstack/react-router";
import type { AttentionItem } from "@/modules/finance/finance/logic";
import { displayInstallmentLabel } from "@/modules/finance/finance/types";

export function AttentionItemLink({ item, className }: { item: AttentionItem; className?: (string) | undefined }) {
  const children = (
    <>
      <span>{displayInstallmentLabel(item.label)}</span>
      <span className="num">{item.value}</span>
    </>
  );

  switch (item.key) {
    case "overdue":
      return <Link to="/finance/fees" search={{ tab: "billing", todayFilter: "overdue" }} className={className}>{children}</Link>;
    case "settlements":
      return <Link to="/finance/settlements" search={{ tab: "overview" }} className={className}>{children}</Link>;
    case "petty":
      return <Link to="/finance/petty-cash" className={className}>{children}</Link>;
    case "cash":
      return <Link to="/finance/ledgers" search={{ tab: "cash" }} className={className}>{children}</Link>;
    case "bank":
      return <Link to="/finance/ledgers" search={{ tab: "bank" }} className={className}>{children}</Link>;
  }
}
