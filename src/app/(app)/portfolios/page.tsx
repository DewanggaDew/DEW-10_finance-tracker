import Link from "next/link";
import { formatMoney } from "@/core/money";
import { createPortfolio, deleteAccount, deletePortfolio } from "@/server/actions";
import { getAccountsWithValues, getPortfolios } from "@/server/read";
import { requireUserId } from "@/server/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AccountForm } from "./account-form";

export default async function PortfoliosPage() {
  const userId = await requireUserId();
  const [portfolios, accounts] = await Promise.all([
    getPortfolios(userId),
    getAccountsWithValues(userId),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <p className="label-caps">Organize</p>
        <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight">
          Portfolios
        </h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>New portfolio</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createPortfolio} className="flex gap-2">
            <Input name="name" placeholder="e.g. Emergency fund" required />
            <Button type="submit">Create</Button>
          </form>
        </CardContent>
      </Card>

      {portfolios.map((p) => {
        const rows = accounts.filter((a) => a.portfolioId === p.id);
        return (
          <Card key={p.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{p.name}</CardTitle>
              <form action={deletePortfolio}>
                <input type="hidden" name="id" value={p.id} />
                <Button variant="ghost" size="sm" type="submit">
                  Delete
                </Button>
              </form>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No accounts yet.</p>
              ) : (
                <ul className="divide-y">
                  {rows.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/accounts/${a.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {a.name}
                        </Link>
                        <Badge variant="secondary">{a.type}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm tabular-nums">
                          {formatMoney(a.valueMinor, a.currency)}
                        </span>
                        <form action={deleteAccount}>
                          <input type="hidden" name="id" value={a.id} />
                          <Button variant="ghost" size="sm" type="submit">
                            ✕
                          </Button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}

      {portfolios.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>New account</CardTitle>
          </CardHeader>
          <CardContent>
            <AccountForm
              portfolios={portfolios.map((p) => ({ id: p.id, name: p.name }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
