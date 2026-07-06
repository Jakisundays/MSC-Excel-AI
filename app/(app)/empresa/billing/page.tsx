import { getSession } from "@/lib/auth";
import { getActivePlans } from "@/lib/billing-server";
import { getCompanyBilling } from "@/lib/company";
import { CompanyBillingView } from "@/components/company-billing-view";
import { CompanyOnboardingForm } from "@/components/company-onboarding-form";
import { EmptyState } from "@/components/empty-state";
import { TriangleAlert } from "lucide-react";

export const metadata = { title: "Facturación" };

export default async function EmpresaBillingPage() {
  const session = await getSession();
  if (!session) return null;

  if (!session.company) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <CompanyOnboardingForm />
      </div>
    );
  }

  const [plans, billing] = await Promise.all([
    getActivePlans(),
    getCompanyBilling(session.company),
  ]);

  if (!billing) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Sin suscripción todavía"
        description="Tu empresa no tiene una suscripción registrada. Contactá a soporte si esto no debería estar pasando."
      />
    );
  }

  return (
    <CompanyBillingView
      plans={plans}
      currentPlanKey={billing.plan.key}
      status={billing.subscription.status}
      currentPeriodEnd={billing.subscription.current_period_end}
      activeSeats={billing.activeSeats}
      usedThisMonth={billing.usedThisMonth}
      usageLimit={billing.subscription.usage_limit_override ?? billing.plan.max_comparisons_month}
      seatLimit={billing.subscription.seats_purchased ?? billing.plan.max_seats}
    />
  );
}
