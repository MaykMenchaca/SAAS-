import { Users } from "lucide-react";

import type { User } from "../../api/users";
import { Avatar, Badge, Card, EmptyState, ErrorState, SkeletonTable, Table, tableCellClass, tableHeadClass } from "../../components/ui";
import { cn } from "../../lib/cn";
import { formatLastLogin, roleLabel } from "./helpers";

type UserListProps = {
  canCreate: boolean;
  isError: boolean;
  isLoading: boolean;
  onCreate: () => void;
  onRetry: () => void;
  onSelect: (user: User) => void;
  selectedId: number | null;
  users: User[];
};

export function UserList({ canCreate, isError, isLoading, onCreate, onRetry, onSelect, selectedId, users }: UserListProps) {
  if (isLoading) return <SkeletonTable cols={4} rows={6} />;
  if (isError) return <ErrorState onRetry={onRetry} />;
  if (users.length === 0) {
    return (
      <Card>
        <EmptyState
          actionLabel={canCreate ? "Nuevo usuario" : undefined}
          icon={<Users size={32} />}
          message="No hay usuarios que coincidan."
          onAction={canCreate ? onCreate : undefined}
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden" frame>
      <Table>
        <caption className="sr-only">Tabla de usuarios</caption>
        <thead>
          <tr>
            <th className={tableHeadClass}>Usuario</th>
            <th className={tableHeadClass}>Rol</th>
            <th className={tableHeadClass}>Último acceso</th>
            <th className={tableHeadClass}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const selected = user.id === selectedId;
            return (
              <tr
                aria-selected={selected}
                className={cn(
                  "cursor-pointer transition-colors duration-150 hover:bg-line-soft",
                  selected && "bg-acc-tint shadow-[inset_2px_0_0_var(--color-accent)]",
                  !user.is_active && "opacity-70",
                )}
                key={user.id}
                onClick={() => onSelect(user)}
              >
                <td className={tableCellClass}>
                  <button
                    aria-label={`Editar ${user.full_name}`}
                    className="flex min-h-11 items-center gap-3 text-left"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(user);
                    }}
                    type="button"
                  >
                    <Avatar name={user.full_name} size="sm" />
                    <span>
                      <span className="block font-medium text-text">{user.full_name}</span>
                      <span className="block text-xs text-ink-2">@{user.username}</span>
                    </span>
                  </button>
                </td>
                <td className={tableCellClass}>
                  <Badge tone={user.role === "admin" ? "accent" : "neutral"}>{roleLabel(user.role)}</Badge>
                </td>
                <td className={cn(tableCellClass, "whitespace-nowrap text-ink-2")}>{formatLastLogin(user.last_login_at)}</td>
                <td className={tableCellClass}>
                  <Badge dot tone={user.is_active ? "success" : "neutral"}>
                    {user.is_active ? "Activo" : "Inactivo"}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}
