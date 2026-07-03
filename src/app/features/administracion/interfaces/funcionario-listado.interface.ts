export type FuncionarioEstado = 'Activo' | 'Pendiente' | 'Inactivo';

export interface FuncionarioListado {
  id: number;
  especialidad: string;
  identificacion: string;
  nombres: string;
  correo: string;
  cargo: string;
  dependencia: string;
  ubicacion: string;
  estado: FuncionarioEstado;
}
