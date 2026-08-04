export type UiApiCategoryId = 'forms' | 'data' | 'actions' | 'structure';
export type UiApiMemberKind = 'input' | 'output' | 'model' | 'directive' | 'slot';

export interface UiApiMemberDoc {
  readonly name: string;
  readonly kind: UiApiMemberKind;
  readonly type: string;
  readonly defaultValue: string;
  readonly description: string;
}

export interface UiApiComponentDoc {
  readonly selector: string;
  readonly name: string;
  readonly category: UiApiCategoryId;
  readonly summary: string;
  readonly controlValueAccessor?: boolean;
  readonly notes?: readonly string[];
  readonly example: string;
  readonly members: readonly UiApiMemberDoc[];
}

export interface UiApiCategoryDoc {
  readonly id: UiApiCategoryId;
  readonly label: string;
  readonly icon: string;
  readonly description: string;
}
