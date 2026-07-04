import Link from "next/link";
import { SearchX } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <EmptyState
        icon={SearchX}
        title="Solicitud no encontrada"
        description="No existe o no tenés acceso a esta solicitud."
        action={
          <Button asChild size="sm">
            <Link href="/historial">Volver al historial</Link>
          </Button>
        }
      />
    </div>
  );
}
