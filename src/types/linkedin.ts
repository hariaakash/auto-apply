export type Option = {
    option: string;
    selector: string;
    required?: boolean;
};

export enum FieldTypes {
    TEXT = 'TEXT',
    RADIO = 'RADIO',
    SELECT = 'SELECT',
    CHECKBOX = 'CHECKBOX',
    NUMERIC = 'NUMERIC',
}

interface IFormBaseField {
    label: string;
    selector: string;
    required: boolean;
}

export interface IFormInputField extends IFormBaseField {
    type: FieldTypes.TEXT | FieldTypes.NUMERIC,
};

export interface IFormOptionField extends IFormBaseField {
    type: FieldTypes.SELECT | FieldTypes.RADIO | FieldTypes.CHECKBOX,
    options: Option[];
};

export type IFormField = IFormInputField | IFormOptionField;