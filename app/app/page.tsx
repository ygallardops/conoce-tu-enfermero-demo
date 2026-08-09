import type { Metadata } from "next";
import { ConsultaClient } from "./components/ConsultaClient";
import { activeBrand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Conoce a tu Enfermero — Demo",
  description:
    "Prototipo público para consultar colegiatura y habilidad con datos sintéticos.",
};

export default function Home() {
  return <ConsultaClient brand={activeBrand} />;
}
