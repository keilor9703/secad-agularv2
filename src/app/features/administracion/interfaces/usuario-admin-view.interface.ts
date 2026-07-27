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
  fecha_fin?: string | null;
  estado?: string | null;
  justificacion?: string | null;
}
