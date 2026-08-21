export type TabKey = 'datos' | 'roles';
export type RolEstado = 'Vigente' | 'Vencido';

export interface UserRole {
  id: number;
  nombre: string;
  fechaExpiracion: string;
  estado: RolEstado;
  justificacion: string;
}

export interface NewRoleForm {
  rolId: number | null;
  justificacion: string;
  fechaFin: string;
}

/** Comando emitido por el diálogo de retiro con su justificación auditable. */
export interface RemoveRoleCommand {
  role: UserRole;
  observacion: string;
}

export interface UserProfile {
  identificacion: string;
  nombres: string;
  apellidos: string;
  grado: string;
  nombreCompleto: string;
  usuarioEmpresarial: string;
  email: string;
  telefono: string;
  situacionLaboral: string;
  unidad: string;
  unidadFisica: string;
  cargo: string;
  gradAlfabetico: string;
  funcionarioCodigo: string;
  undeLaborandoCodigo: string;
  codigoCargo: string;
  activo: boolean;
  ultimoIngreso: string;
  fotoUrl?: string;
  roles: UserRole[];
}

export interface RawAssignedRole {
  id?: number;
  rol?: string | null;
  fechaFin?: string | null;
  FechaFin?: string | null;
  fecha_fin?: string | null;
  FECHA_FIN?: string | null;
  fechaExpiracion?: string | null;
  fecha_expiracion?: string | null;
  fechaVencimiento?: string | null;
  fecha_vencimiento?: string | null;
  fechaFinalizacion?: string | null;
  estado?: string | null;
  justificacion?: string | null;
}
