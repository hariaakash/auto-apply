export type Option = { option: string; selector: string };

export enum FieldTypes {
    TEXT = 'TEXT',
    RADIO = 'RADIO',
    SELECT = 'SELECT',
    CHECKBOX = 'CHECKBOX',
    NUMERIC = 'NUMERIC',
}

export interface IFormInputField {
    label: string;
    type: FieldTypes.TEXT | FieldTypes.NUMERIC,
    selector: string;
};

export interface IFormOptionField {
    label: string;
    type: FieldTypes.SELECT | FieldTypes.RADIO | FieldTypes.CHECKBOX,
    options: Option[];
    selector: string;
};

export type IFormField = IFormInputField | IFormOptionField;