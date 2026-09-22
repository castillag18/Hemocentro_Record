"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Pagination } from "@/components/Pagination";
import { LoadingOverlay, Spinner } from "@/components/Spinner";
import { alertError, alertSuccess, confirmAction, showLoading, closeLoading } from "@/lib/alerts";
import { Modal } from "@/components/Modal";
import { userCreateSchema, userFormSchema } from "@/lib/validation/schemas";

type User = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "operador";
  active: boolean;
  createdAt: string;
};

type UserForm = {
  email: string;
  password: string;
  name: string;
  role: "admin" | "operador";
};

const EMPTY: UserForm = {
  email: "",
  password: "",
  name: "",
  role: "operador",
};

export default function UsuariosPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [pageSize] = useState(15);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (q.trim()) params.set("q", q.trim());
    const res = await api<{ users: User[]; total: number; page: number; pageSize: number }>(
      `/api/users?${params}`,
    );
    setUsers(res.users);
    setTotal(res.total);
  }, [page, pageSize, q]);

  useEffect(() => {
    void load().catch((err) => void alertError("Error", err instanceof Error ? err.message : "Error"));
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setFieldErrors({});
    setOpen(true);
  }

  function openEdit(user: User) {
    setEditing(user);
    setForm({
      email: user.email,
      password: "",
      name: user.name,
      role: user.role,
    });
    setFieldErrors({});
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});

    const schema = editing ? userFormSchema : userCreateSchema;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errors[String(issue.path[0] ?? "form")] = issue.message;
      }
      setFieldErrors(errors);
      void alertError("Revise el formulario", Object.values(errors)[0]);
      return;
    }

    setLoading(true);
    showLoading("Guardando usuario...");
    try {
      if (editing) {
        await api("/api/users", {
          method: "PUT",
          body: JSON.stringify({
            id: editing.id,
            ...parsed.data,
            ...(parsed.data.password ? { password: parsed.data.password } : {}),
          }),
        });
        closeLoading();
        await alertSuccess("Actualizado", "Usuario actualizado");
      } else {
        await api("/api/users", {
          method: "POST",
          body: JSON.stringify(parsed.data),
        });
        closeLoading();
        await alertSuccess("Creado", "Usuario creado");
      }
      setOpen(false);
      await load();
    } catch (err) {
      closeLoading();
      void alertError("Error", err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(user: User) {
    try {
      await api("/api/users", {
        method: "PUT",
        body: JSON.stringify({ id: user.id, active: !user.active }),
      });
      await load();
      await alertSuccess("Estado actualizado");
    } catch (err) {
      void alertError("Error", err instanceof Error ? err.message : "No se pudo actualizar");
    }
  }

  async function remove(user: User) {
    const ok = await confirmAction("¿Eliminar usuario?", user.email);
    if (!ok) return;
    showLoading("Eliminando...");
    try {
      await api(`/api/users?id=${encodeURIComponent(user.id)}`, { method: "DELETE" });
      closeLoading();
      await alertSuccess("Eliminado", "Usuario eliminado");
      await load();
    } catch (err) {
      closeLoading();
      void alertError("Error", err instanceof Error ? err.message : "No se pudo eliminar");
    }
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-lg gap-md flex-wrap">
        <div>
          <h1 className="text-headline-lg">Usuarios del sistema</h1>
          <p className="text-body-md text-secondary mt-2">
            Administre cuentas de acceso al panel de HEMOCENTRO.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Icon name="person_add" /> Nuevo usuario
        </Button>
      </div>

      <div className="mb-md relative max-w-md">
        <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
        <input
          className="w-full pl-10 pr-3 py-2 border border-outline-variant rounded-lg text-sm"
          placeholder="Buscar por nombre o correo..."
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
      </div>

      <div className="bg-white rounded-xl border border-outline-variant overflow-hidden shadow-level-1">
        <table className="w-full text-left">
          <thead className="bg-surface-container-low border-b border-outline-variant">
            <tr>
              <th className="p-sm text-label-md uppercase">Nombre</th>
              <th className="p-sm text-label-md uppercase">Correo</th>
              <th className="p-sm text-label-md uppercase">Rol</th>
              <th className="p-sm text-label-md uppercase">Estado</th>
              <th className="p-sm text-label-md uppercase text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant text-body-sm">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-surface-container-low">
                <td className="p-sm font-medium">{user.name || "—"}</td>
                <td className="p-sm font-mono">{user.email}</td>
                <td className="p-sm capitalize">{user.role}</td>
                <td className="p-sm">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      user.active
                        ? "bg-tertiary-container/20 text-tertiary"
                        : "bg-surface-variant text-secondary"
                    }`}
                  >
                    {user.active ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="p-sm text-right space-x-1">
                  <button
                    type="button"
                    className="text-secondary hover:text-primary p-1"
                    onClick={() => openEdit(user)}
                    title="Editar"
                  >
                    <Icon name="edit" />
                  </button>
                  <button
                    type="button"
                    className="text-secondary hover:text-primary p-1"
                    onClick={() => void toggleActive(user)}
                    title={user.active ? "Desactivar" : "Activar"}
                  >
                    <Icon name={user.active ? "block" : "check_circle"} />
                  </button>
                  <button
                    type="button"
                    className="text-error hover:opacity-80 p-1"
                    onClick={() => void remove(user)}
                    title="Eliminar"
                  >
                    <Icon name="delete" />
                  </button>
                </td>
              </tr>
            ))}
            {!users.length ? (
              <tr>
                <td colSpan={5} className="p-lg text-center text-secondary">
                  No hay usuarios registrados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} />
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar usuario" : "Nuevo usuario"}
        subtitle="Correo, contraseña, nombre y rol de acceso."
      >
        <form onSubmit={(e) => void save(e)} className="space-y-md">
          <label className="block">
            <span className="text-label-md text-secondary uppercase">Nombre</span>
            <input
              maxLength={120}
              className="mt-1 w-full border border-secondary-container rounded-lg p-2.5 text-sm outline-none focus:border-primary"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {fieldErrors.name ? <span className="text-xs text-error">{fieldErrors.name}</span> : null}
          </label>
          <label className="block">
            <span className="text-label-md text-secondary uppercase">Correo</span>
            <input
              type="email"
              maxLength={254}
              className="mt-1 w-full border border-secondary-container rounded-lg p-2.5 text-sm outline-none focus:border-primary"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            {fieldErrors.email ? <span className="text-xs text-error">{fieldErrors.email}</span> : null}
          </label>
          <label className="block">
            <span className="text-label-md text-secondary uppercase">
              Contraseña {editing ? "(opcional)" : ""}
            </span>
            <input
              type="password"
              maxLength={128}
              className="mt-1 w-full border border-secondary-container rounded-lg p-2.5 text-sm outline-none focus:border-primary"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            {fieldErrors.password ? <span className="text-xs text-error">{fieldErrors.password}</span> : null}
          </label>
          <label className="block">
            <span className="text-label-md text-secondary uppercase">Rol</span>
            <select
              className="mt-1 w-full border border-secondary-container rounded-lg p-2.5 text-sm bg-white"
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as "admin" | "operador" })
              }
            >
              <option value="admin">Administrador</option>
              <option value="operador">Operador</option>
            </select>
          </label>
          <div className="flex justify-end gap-sm">
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Spinner size="sm" className="text-white" /> : null}
              Guardar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
