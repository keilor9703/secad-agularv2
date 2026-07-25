import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { ToastService, type ToastType } from '../../../../core/services/toast.service';
import {
  UiButtonComponent,
  type UiButtonVariant,
} from '../../../../shared/components/ui-button/ui-button.component';
import { UiModalComponent } from '../../../../shared/components/ui-modal/ui-modal.component';
import { AlertService } from '../../../../shared/services/alert.service';

interface FeedbackExample {
  readonly type: ToastType;
  readonly label: string;
  readonly title: string;
  readonly message: string;
  readonly icon: string;
  readonly variant: UiButtonVariant;
}

type InteractionTone = ToastType | 'neutral';

interface InteractionState {
  readonly title: string;
  readonly detail: string;
  readonly tone: InteractionTone;
  readonly icon: string;
}

@Component({
  selector: 'app-notificaciones-demo',
  standalone: true,
  imports: [UiButtonComponent, UiModalComponent],
  templateUrl: './notificaciones-demo.component.html',
  styleUrl: './notificaciones-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificacionesDemoComponent {
  private readonly toast = inject(ToastService);
  private readonly alert = inject(AlertService);

  readonly layerModalOpen = signal(false);
  readonly deleteInProgress = signal(false);
  readonly lastInteraction = signal<InteractionState>({
    title: 'Demostración preparada',
    detail: 'Seleccione una acción para comprobar su comportamiento.',
    tone: 'neutral',
    icon: 'fa-solid fa-circle-info',
  });

  readonly toastExamples: readonly FeedbackExample[] = [
    {
      type: 'success',
      label: 'Éxito',
      title: 'Cambios guardados',
      message: 'La información se actualizó correctamente.',
      icon: 'fa-solid fa-circle-check',
      variant: 'primary',
    },
    {
      type: 'info',
      label: 'Información',
      title: 'Proceso iniciado',
      message: 'La solicitud se está procesando en segundo plano.',
      icon: 'fa-solid fa-circle-info',
      variant: 'info',
    },
    {
      type: 'warning',
      label: 'Advertencia',
      title: 'Revisión pendiente',
      message: 'Existen datos que requieren validación.',
      icon: 'fa-solid fa-triangle-exclamation',
      variant: 'warning',
    },
    {
      type: 'error',
      label: 'Error',
      title: 'No fue posible guardar',
      message: 'Revise la información e intente nuevamente.',
      icon: 'fa-solid fa-circle-xmark',
      variant: 'danger',
    },
  ];

  readonly alertExamples: readonly FeedbackExample[] = [
    {
      type: 'success',
      label: 'Éxito',
      title: 'Operación completada',
      message: 'El registro quedó disponible para su consulta.',
      icon: 'fa-solid fa-circle-check',
      variant: 'primary',
    },
    {
      type: 'info',
      label: 'Información',
      title: 'Información importante',
      message: 'Esta acción requiere confirmación del usuario.',
      icon: 'fa-solid fa-circle-info',
      variant: 'info',
    },
    {
      type: 'warning',
      label: 'Advertencia',
      title: 'Verifique la operación',
      message: 'Los cambios afectarán la configuración actual.',
      icon: 'fa-solid fa-triangle-exclamation',
      variant: 'warning',
    },
    {
      type: 'error',
      label: 'Error',
      title: 'Operación no disponible',
      message: 'El servicio no respondió. Intente más tarde.',
      icon: 'fa-solid fa-circle-xmark',
      variant: 'danger',
    },
  ];

  /**
   * Los toasts comunican resultados breves sin interrumpir el flujo.
   */
  showToast(example: FeedbackExample): void {
    switch (example.type) {
      case 'success':
        this.toast.success(example.title, example.message);
        break;
      case 'info':
        this.toast.info(example.title, example.message);
        break;
      case 'warning':
        this.toast.warning(example.title, example.message);
        break;
      case 'error':
        this.toast.error(example.title, example.message);
        break;
    }

    this.recordInteraction(
      `Toast de ${example.label.toLowerCase()}`,
      'Notificación no bloqueante enviada al host global.',
      example.type,
      example.icon,
    );
  }

  /**
   * Las alertas se reservan para información que debe ser reconocida.
   */
  async showAlert(example: FeedbackExample): Promise<void> {
    switch (example.type) {
      case 'success':
        await this.alert.success(example.title, example.message);
        break;
      case 'info':
        await this.alert.info(example.title, example.message);
        break;
      case 'warning':
        await this.alert.warning(example.title, example.message);
        break;
      case 'error':
        await this.alert.error(example.title, example.message);
        break;
    }

    this.recordInteraction(
      `Alerta de ${example.label.toLowerCase()}`,
      'El usuario reconoció el mensaje y cerró la alerta.',
      example.type,
      example.icon,
    );
  }

  /**
   * Una confirmación se espera con await y se abandona temprano al cancelar.
   */
  async requestConfirmation(): Promise<void> {
    const confirmed = await this.alert.confirm({
      title: 'Confirmar operación',
      message: '¿Desea aplicar los cambios de configuración?',
      confirmText: 'Aplicar cambios',
      cancelText: 'Cancelar',
      icon: 'question',
      intent: 'primary',
      focusCancel: true,
    });

    if (!confirmed) {
      this.toast.info('Sin cambios', 'La operación fue cancelada.');
      this.recordInteraction(
        'Confirmación cancelada',
        'No se ejecutó ninguna operación.',
        'info',
        'fa-solid fa-ban',
      );
      return;
    }

    this.toast.success('Configuración', 'Los cambios fueron aplicados.');
    this.recordInteraction(
      'Confirmación aceptada',
      'La operación continuó después de la aprobación.',
      'success',
      'fa-solid fa-circle-check',
    );
  }

  /**
   * Ejemplo de operación destructiva con bloqueo de doble ejecución.
   */
  async requestDelete(): Promise<void> {
    if (this.deleteInProgress()) {
      return;
    }

    const confirmed = await this.alert.confirmDelete(
      'Eliminar registro',
      'Esta acción es permanente y no se puede deshacer.',
      'Sí, eliminar',
    );

    if (!confirmed) {
      this.recordInteraction(
        'Eliminación cancelada',
        'El registro permanece sin cambios.',
        'neutral',
        'fa-solid fa-shield',
      );
      return;
    }

    this.deleteInProgress.set(true);

    try {
      await this.simulateRequest();
      this.toast.success('Registro eliminado', 'La operación finalizó correctamente.');
      this.recordInteraction(
        'Registro eliminado',
        'La confirmación destructiva fue aceptada.',
        'success',
        'fa-solid fa-trash-can',
      );
    } catch {
      await this.alert.error(
        'No fue posible eliminar',
        'Ocurrió un error inesperado durante la operación.',
      );
      this.recordInteraction(
        'Error de eliminación',
        'La operación no pudo completarse.',
        'error',
        'fa-solid fa-circle-xmark',
      );
    } finally {
      this.deleteInProgress.set(false);
    }
  }

  openLayerModal(): void {
    this.layerModalOpen.set(true);
  }

  closeLayerModal(): void {
    this.layerModalOpen.set(false);
  }

  showToastOverModal(): void {
    this.toast.success(
      'Toast sobre modal',
      'La capa global permanece visible por encima del modal.',
    );
    this.recordInteraction(
      'Capas verificadas',
      'El toast se mostró sobre el modal de demostración.',
      'success',
      'fa-solid fa-layer-group',
    );
  }

  async showAlertOverModal(): Promise<void> {
    await this.alert.info(
      'Alerta sobre modal',
      'SweetAlert2 utiliza una capa superior y conserva el foco correctamente.',
    );
    this.recordInteraction(
      'Capas verificadas',
      'SweetAlert2 se mostró sobre el modal de demostración.',
      'info',
      'fa-solid fa-layer-group',
    );
  }

  private recordInteraction(
    title: string,
    detail: string,
    tone: InteractionTone,
    icon: string,
  ): void {
    this.lastInteraction.set({ title, detail, tone, icon });
  }

  /**
   * Solo representa una llamada HTTP para visualizar el estado loading.
   */
  private simulateRequest(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 550));
  }
}
