export type FuncionarioEstado = 'Activo' | 'Inactivo' | 'Novedad';

export interface FuncionarioListado {
  id: number;
  especialidad: string;
  identificacion: string;
  nombresApellidos: string;
  correo: string;
  cargo: string;
  unidad: string;
  estado: FuncionarioEstado;
}
