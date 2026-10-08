import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Edit, Search, Shield, UserMinus, UserPlus, Users } from "lucide-react";

import type { Role, User, UserCreatePayload, UserUpdatePayload } from "../api/users";
import { createUser, deactivateUser, listRoles, listUsers, updateUser } from "../api/users";
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Input, Modal, Pagination, Select, SkeletonTable, Table, Toggle, Tooltip, tableCellClass, tableHeadClass, tableRowClass } from "../components/ui";

// ── Helpers ────────────────────────────────────────────────────────

type UserFormState = {
  username: string;
  password: string;
  full_name: string;
  email: string;
  role_id: string;
};

const emptyForm: UserFormState = {
  username: "",
  password: "",
  full_name: "",
  email: "",
  role_id: "",
};

function roleTone(role: string): "neutral" | "success" | "warning" {
  if (role === "admin") return "warning";
  if (role === "cajero") return "success";
  return "neutral";
}

// ── Main Page ──────────────────────────────────────────────────────

export function UsersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<number | null>(null);

  const usersQuery = useQuery({
    queryKey: ["users", page, search, showInactive],
    queryFn: () => listUsers({ page, search, includeInactive: showInactive }),
  });

  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: listRoles,
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UserUpdatePayload }) => updateUser(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      closeModal();
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateUser,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const users = usersQuery.data?.items ?? [];
  const totalPages = usersQuery.data?.pages ?? 1;
  const roles = rolesQuery.data ?? [];

  function openCreateModal() {
    setEditingUser(null);
    setIsModalOpen(true);
  }

  function openEditModal(user: User) {
    setEditingUser(user);
    setIsModalOpen(true);
  }

  function closeModal() {
    setEditingUser(null);
    setIsModalOpen(false);
    createMutation.reset();
    updateMutation.reset();
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-text-primary">Usuarios</h1>
          <p className="text-sm text-neutral-text-secondary">Administración de cuentas y roles</p>
        </div>
        <Button icon={<UserPlus aria-hidden="true" size={18} />} onClick={openCreateModal}>
          Nuevo
        </Button>
      </div>

      <section className="grid gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <form className="flex flex-1 flex-col gap-2 sm:flex-row" onSubmit={handleSearch}>
            <Input
              label="Buscar"
              name="search"
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Nombre o usuario"
              value={searchInput}
            />
            <div className="flex items-end">
              <Button className="w-full sm:w-auto" icon={<Search aria-hidden="true" size={18} />} type="submit">
                Buscar
              </Button>
            </div>
          </form>
          <Toggle checked={showInactive} label="Mostrar inactivos" onChange={setShowInactive} />
        </div>

        {usersQuery.isLoading ? (
          <SkeletonTable rows={6} cols={5} />
        ) : usersQuery.isError ? (
          <ErrorState onRetry={() => void usersQuery.refetch()} />
        ) : users.length === 0 ? (
          <EmptyState icon={<Users size={32} />} message="Solo tu por aqui." actionLabel="Nuevo usuario" onAction={openCreateModal} />
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <caption className="sr-only">Tabla de usuarios</caption>
              <thead>
                <tr>
                  <th className={tableHeadClass}>Usuario</th>
                  <th className={tableHeadClass}>Rol</th>
                  <th className={tableHeadClass}>Último acceso</th>
                  <th className={tableHeadClass}>Estado</th>
                  <th className={tableHeadClass}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr className={tableRowClass} key={user.id}>
                    <td className={tableCellClass}>
                      <div className="flex items-center gap-3">
                        <Avatar name={user.full_name} size="sm" />
                        <div>
                          <div className="font-semibold text-neutral-text-primary">{user.full_name}</div>
                          <div className="text-xs text-neutral-text-secondary">@{user.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className={tableCellClass}>
                      <Badge tone={roleTone(user.role)}>
                        <Shield aria-hidden="true" className="mr-1 inline" size={12} />
                        {user.role}
                      </Badge>
                    </td>
                    <td className={`${tableCellClass} text-sm text-neutral-text-secondary`}>
                      {user.last_login_at
                        ? new Date(user.last_login_at).toLocaleString("es-MX", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Nunca"}
                    </td>
                    <td className={tableCellClass}>
                      <Badge dot tone={user.is_active ? "success" : "danger"}>
                        {user.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className={tableCellClass}>
                      <div className="flex gap-2">
                        <Tooltip content="Editar">
                          <Button
                            aria-label={`Editar ${user.full_name}`}
                            className="h-11 w-11 px-0"
                            onClick={() => openEditModal(user)}
                            variant="secondary"
                          >
                            <Edit aria-hidden="true" size={17} />
                          </Button>
                        </Tooltip>
                        <Tooltip content="Desactivar">
                          <Button
                            aria-label={`Desactivar ${user.full_name}`}
                            className="h-11 w-11 px-0 hover:text-danger hover:bg-danger/10"
                            disabled={!user.is_active}
                            onClick={() => setConfirmDeactivateId(user.id)}
                            variant="ghost"
                          >
                            <UserMinus aria-hidden="true" size={17} />
                          </Button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-text-secondary">
          <span>Página {usersQuery.data?.page ?? page} de {totalPages}</span>
          <Pagination onPageChange={setPage} page={page} totalPages={totalPages} />
        </div>
      </section>

      <UserFormModal
        error={createMutation.error ?? updateMutation.error}
        isLoading={createMutation.isPending || updateMutation.isPending}
        onClose={closeModal}
        onSubmit={(payload) => {
          if (editingUser) {
            const update: UserUpdatePayload = {
              full_name: payload.full_name,
              email: payload.email || null,
              role_id: payload.role_id,
            };
            if (payload.password) {
              update.password = payload.password;
            }
            updateMutation.mutate({ id: editingUser.id, payload: update });
          } else {
            createMutation.mutate(payload);
          }
        }}
        open={isModalOpen}
        roles={roles}
        user={editingUser}
      />

      {confirmDeactivateId ? (
        <Modal
          footer={
            <>
              <Button onClick={() => setConfirmDeactivateId(null)} variant="secondary">
                Cancelar
              </Button>
              <Button
                disabled={deactivateMutation.isPending}
                onClick={() => {
                  deactivateMutation.mutate(confirmDeactivateId, {
                    onSuccess: () => setConfirmDeactivateId(null),
                  });
                }}
                variant="danger"
              >
                {deactivateMutation.isPending ? "Desactivando..." : "Desactivar"}
              </Button>
            </>
          }
          onClose={() => setConfirmDeactivateId(null)}
          open
          title="Confirmar desactivación"
        >
          <p className="text-sm text-neutral-text-secondary">
            El usuario será desactivado y no podrá iniciar sesión. Esta acción se puede revertir posteriormente.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

// ── User Form Modal ───────────────────────────────────────────────

type UserFormModalProps = {
  error: Error | null;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (payload: UserCreatePayload) => void;
  open: boolean;
  roles: Role[];
  user: User | null;
};

function UserFormModal({ error, isLoading, onClose, onSubmit, open, roles, user }: UserFormModalProps) {
  const initialForm = useMemo(
    () =>
      user
        ? {
            username: user.username,
            password: "",
            full_name: user.full_name,
            email: user.email ?? "",
            role_id: String(user.role_id),
          }
        : emptyForm,
    [user],
  );

  const [form, setForm] = useState<UserFormState>(initialForm);

  useEffect(() => {
    setForm(initialForm);
  }, [initialForm]);

  const canSubmit = Boolean(
    form.username.trim() && form.full_name.trim() && form.role_id && (user || form.password.trim()),
  );

  function setField(field: keyof UserFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      username: form.username.trim(),
      password: form.password,
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      role_id: Number(form.role_id),
    });
  }

  const errorMessage = getErrorMessage(error);

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            Cancelar
          </Button>
          <Button disabled={!canSubmit || isLoading} form="user-form" type="submit">
            {isLoading ? "Guardando" : "Guardar"}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title={user ? "Editar usuario" : "Nuevo usuario"}
    >
      <form className="grid gap-4" id="user-form" onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            disabled={!!user}
            label="Usuario"
            name="username"
            onChange={(e) => setField("username", e.target.value)}
            placeholder="ej. jperez"
            value={form.username}
          />
          <Input
            label={user ? "Nueva contraseña (opcional)" : "Contraseña"}
            name="password"
            onChange={(e) => setField("password", e.target.value)}
            placeholder={user ? "Dejar vacio para mantener" : ""}
            type="password"
            value={form.password}
          />
        </div>

        <Input
          label="Nombre completo"
          name="full_name"
          onChange={(e) => setField("full_name", e.target.value)}
          value={form.full_name}
        />

        <Input
          label="Email (opcional)"
          name="email"
          onChange={(e) => setField("email", e.target.value)}
          type="email"
          value={form.email}
        />

        <Select
          label="Rol"
          name="role_id"
          onChange={(e) => setField("role_id", e.target.value)}
          options={roles.map((role) => ({ value: role.id, label: `${role.name}${role.description ? ` — ${role.description}` : ""}` }))}
          placeholder="Seleccionar rol"
          value={form.role_id}
        />

        {errorMessage ? (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">
            {errorMessage}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

function getErrorMessage(error: Error | null) {
  if (!error) return "";
  if (error instanceof AxiosError) {
    const details = error.response?.data?.details;
    if (details && typeof details === "object") {
      return Object.values(details).flat().join(" ");
    }
    return error.response?.data?.error ?? "No se pudo guardar.";
  }
  return "No se pudo guardar.";
}
