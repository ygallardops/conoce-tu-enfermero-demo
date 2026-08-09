export type BrandProfileId = "demo" | "cep-preview";

export type BrandProfile = {
  id: BrandProfileId;
  productName: string;
  issuerName: string;
  environmentLabel: string;
  disclaimer: string;
  officialPreview: boolean;
  tokens: {
    primary: string;
    primaryDark: string;
  };
};

const profiles: Record<BrandProfileId, BrandProfile> = {
  demo: {
    id: "demo",
    productName: "Conoce a tu Enfermero — Demo",
    issuerName: "Prototipo técnico independiente",
    environmentLabel: "Entorno demo",
    disclaimer: "Prototipo personal no oficial · Datos sintéticos",
    officialPreview: false,
    tokens: { primary: "#155e63", primaryDark: "#0e4448" },
  },
  "cep-preview": {
    id: "cep-preview",
    productName: "Conoce a tu Enfermero",
    issuerName: "Vista previa institucional no oficial",
    environmentLabel: "Vista previa de marca",
    disclaimer: "Vista previa no oficial · Datos sintéticos",
    officialPreview: true,
    tokens: { primary: "#1d4f91", primaryDark: "#153b6d" },
  },
};

declare const __BRAND_PROFILE__: string;

export function getBrandProfile(candidate?: string): BrandProfile {
  return candidate === "cep-preview" ? profiles["cep-preview"] : profiles.demo;
}

export const activeBrand = getBrandProfile(
  typeof __BRAND_PROFILE__ === "string" ? __BRAND_PROFILE__ : "demo",
);
