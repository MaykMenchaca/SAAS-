import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, UserPlus } from "lucide-react";

import type { User, UserCreatePayload, UserUpdatePayload } from "../api/users";
import {
  createUser,
  deactivateUser,
  listPermissions,
  listRoles,
  listUsers,
  resetUserPassword,
  updateUser,
} from "../api/users";
import { qk } from "../api/query-keys";
import { useCan } from "../components/auth/require-permission";
import { Button, Input, Modal, PageHeader, Pagination, Toggle } from "../components/ui";
import { buildPermissionMatrix, getErrorMessage } from "./users/helpers";
import { PermissionsMatrix } from "./users/permissions-matrix";
import { ResetPasswordModal } from "./users/reset-password-modal";
import { UserList } from "./users/user-list";
import { UserPanel } from "./users/user-panel";

/** `creating` = alta; `number` = id del usuario seleccionado; `null` = panel cerrado. */
type Selection = "creating" | number | null;

export function UsersPage() {
  const queryClient = useQueryClient();
  const can = useCan();
  const canCreate = can("usuarios:crear");
  const canEdit = can("usuarios:editar");
  const canDeactivate = can("usuarios:desactivar");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<number | null>(null);
  const [resetting, setResetting] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: qk.users(page, search, showInactive),
    queryFn: () => listUsers({ page, search, includeInactive: showInactive }),
  });

  const rolesQuery = useQuery({
    queryKey: qk.roles(),
    queryFn: listRoles,
  });

  const permissionsQuery = useQuery({
    queryKey: qk.roles("permissions"),
    queryFn: listPermissions,
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: async (user) => {
      await queryClient.invalidateQueries({ queryKey: qk.users() });
      setSelectedUser(user);
      setSelection(user.id);
      setSaved(true);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UserUpdatePayload }) => updateUser(id, payload),
    onSuccess: async (user) => {
      await queryClient.invalidateQueries({ queryKey: qk.users() });
      setSelectedUser(user);
      setSaved(true);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateUser,
    onSuccess: async (user) => {
      await queryClient.invalidateQueries({ queryKey: qk.users() });
      setSelectedUser(user);
      setConfirmDeactivateId(null);
    },
  });

  const resetMutation = useMutation({
    mutationFn: resetUserPassword,
    onSuccess: async (result) => {
      setTemporaryPassword(result.temporary_password);
      await queryClient.invalidateQueries({ queryKey: qk.users() });
    },
  });

  const users = usersQuery.data?.items ?? [];
  const totalPages = usersQuery.data?.pages ?? 1;
  const roles = rolesQuery.data ?? [];

  // El usuario en edición sale de la lista vigente; si ya no aparece (filtros), se conserva el último conocido.
  const activeUser = useMemo(() => {
    if (typeof selection !== "number") return null;
    return users.find((u) => u.id === selection) ?? (selectedUser?.id === selection ? selectedUser : null);
  }, [selection, selectedUser, users]);

  const matrixRows = useMemo(
    () => buildPermissionMatrix(roles, permissionsQuery.data ?? []),
    [roles, permissionsQuery.data],
  );

  function resetMutations() {
    createMutation.reset();
    updateMutation.reset();
    deactivateMutation.reset();
    resetMutation.reset();
    setSaved(false);
  }

  function openCreate() {
    resetMutations();
    setSelectedUser(null);
    setSelection("creating");
  }

  function selectUser(user: User) {
    resetMutations();
    setSelectedUser(user);
    setSelection(user.id);
  }

  function closePanel() {
    resetMutations();
    setSelection(null);
    setSelectedUser(null);
  }

  function closeReset() {
    setResetting(false);
    setTemporaryPassword(null);
    resetMutation.reset();
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function handleSubmit(payload: UserCreatePayload) {
    setSaved(false);
    if (activeUser) {
      const update: UserUpdatePayload = {
        full_name: payload.full_name,
        email: payload.email || null,
        role_id: payload.role_id,
      };
      if (payload.password) {
        update.password = payload.password;
      }
      updateMutation.mutate({ id: activeUser.id, payload: update });
    } else {
      createMutation.mutate(payload);
    }
  }

  const panelOpen = selection === "creating" || activeUser !== null;
  const panelError = getErrorMessage(createMutation.error ?? updateMutation.error);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        actions={
          canCreate ? (
            <Button frame icon={<UserPlus aria-hidden="true" size={18} />} onClick={openCreate}>
              Nuevo usuario
            </Button>
          ) : undefined
        }
        subtitle="Cuentas de acceso y permisos por rol"
        title="Usuarios"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
        <form className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-80 sm:flex-row sm:items-end" onSubmit={handleSearch}>
          <div className="flex-1">
            <Input
              icon={<Search aria-hidden="true" size={16} />}
              label="Buscar"
              name="search"
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Nombre o usuario"
              value={searchInput}
            />
          </div>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
        <Toggle
          checked={showInactive}
          label="Mostrar inactivos"
          onChange={(value) => {
            setPage(1);
            setShowInactive(value);
          }}
        />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="grid min-w-0 flex-[1_1_34rem] gap-6">
          <section className="grid gap-3">
            <UserList
              canCreate={canCreate}
              isError={usersQuery.isError}
              isLoading={usersQuery.isLoading}
              onCreate={openCreate}
              onRetry={() => void usersQuery.refetch()}
              onSelect={selectUser}
              selectedId={typeof selection === "number" ? selection : null}
              users={users}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-2">
              <span>Página {usersQuery.data?.page ?? page} de {totalPages}</span>
              <Pagination onPageChange={setPage} page={page} totalPages={totalPages} />
            </div>
          </section>

          {permissionsQuery.isError || rolesQuery.isError ? null : (
            <PermissionsMatrix
              highlightRoleId={activeUser?.role_id ?? null}
              roles={roles}
              rows={matrixRows}
            />
          )}
        </div>

        {panelOpen ? (
          <div className="w-full min-w-0 flex-[1_1_21rem] lg:sticky lg:top-5 lg:max-w-md">
            <UserPanel
              canDeactivate={canDeactivate}
              canEdit={activeUser ? canEdit : canCreate}
              error={panelError}
              isSaving={createMutation.isPending || updateMutation.isPending}
              key={activeUser ? `user-${activeUser.id}` : "new"}
              onClose={closePanel}
              onDeactivate={() => activeUser && setConfirmDeactivateId(activeUser.id)}
              onReactivate={() => activeUser && updateMutation.mutate({ id: activeUser.id, payload: { is_active: true } })}
              onResetPassword={() => setResetting(true)}
              onSubmit={handleSubmit}
              roles={roles}
              saved={saved}
              user={activeUser}
            />
          </div>
        ) : null}
      </div>

      {resetting && activeUser ? (
        <ResetPasswordModal
          error={getErrorMessage(resetMutation.error, "No se pudo restablecer la contraseña.")}
          isPending={resetMutation.isPending}
          onClose={closeReset}
          onConfirm={() => resetMutation.mutate(activeUser.id)}
          temporaryPassword={temporaryPassword}
          user={activeUser}
        />
      ) : null}

      {confirmDeactivateId ? (
        <Modal
          footer={
            <>
              <Button onClick={() => setConfirmDeactivateId(null)} variant="secondary">
                Cancelar
              </Button>
              <Button
                disabled={deactivateMutation.isPending}
                onClick={() => deactivateMutation.mutate(confirmDeactivateId)}
                variant="danger"
              >
                {deactivateMutation.isPending ? "Desactivando…" : "Desactivar"}
              </Button>
            </>
          }
          onClose={() => setConfirmDeactivateId(null)}
          open
          title="Confirmar desactivación"
        >
          <div className="grid gap-3">
            <p className="text-sm text-ink-2">
              El usuario será desactivado y no podrá iniciar sesión. Esta acción se puede revertir posteriormente.
            </p>
            {deactivateMutation.error ? (
              <div className="border border-bad bg-bad-tint px-3 py-2 text-sm font-medium text-bad" role="alert">
                {getErrorMessage(deactivateMutation.error, "No se pudo desactivar.")}
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
