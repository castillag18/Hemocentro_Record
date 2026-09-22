"use client";

import Swal from "sweetalert2";

const baseConfig = {
  confirmButtonColor: "#9e001f",
  cancelButtonColor: "#5c5f61",
  customClass: {
    popup: "rounded-xl text-sm",
    title: "text-base font-semibold",
    htmlContainer: "text-sm",
  },
};

export async function alertSuccess(title: string, text?: string) {
  return Swal.fire({ ...baseConfig, icon: "success", title, text, confirmButtonText: "Aceptar" });
}

export async function alertError(title: string, text?: string) {
  return Swal.fire({ ...baseConfig, icon: "error", title, text, confirmButtonText: "Entendido" });
}

export async function alertInfo(title: string, text?: string) {
  return Swal.fire({ ...baseConfig, icon: "info", title, text, confirmButtonText: "Aceptar" });
}

export async function alertWarning(title: string, text?: string) {
  return Swal.fire({ ...baseConfig, icon: "warning", title, text, confirmButtonText: "Aceptar" });
}

export async function confirmAction(title: string, text?: string) {
  const result = await Swal.fire({
    ...baseConfig,
    icon: "question",
    title,
    text,
    showCancelButton: true,
    confirmButtonText: "Sí, continuar",
    cancelButtonText: "Cancelar",
  });
  return result.isConfirmed;
}

export function showLoading(title = "Cargando...") {
  Swal.fire({
    ...baseConfig,
    title,
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: () => Swal.showLoading(),
  });
}

export function closeLoading() {
  Swal.close();
}
