import React, { useEffect, useMemo, useState } from 'react';
import { Save, AlertCircle, Loader2, X, Eye, EyeOff } from 'lucide-react';
import { FieldDef, OpcaoRef, RegistroCrud, ResourceDef } from '../types';
import { toInputDate, toInputDateTime } from '../utils/formatters';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS, HINT_CLASS } from '../utils/formStyles';
import { DateField } from './DateField';
import { NumberField } from './NumberField';
import { Toggle } from './Toggle';

interface RecordFormProps {
  resource: ResourceDef;
  /** Registro em edição; `null` indica inclusão */
  record: RegistroCrud | null;
  refOptions: Record<string, OpcaoRef[]>;
  /** Colunas exibidas hoje na lista */
  colunasLista: string[];
  /** Mostra/oculta a coluna na lista (ícone ao lado do rótulo) */
  onAlternarColunaLista: (nome: string) => void;
  onCancel: () => void;
  onSave: (payload: RegistroCrud) => Promise<void>;
}

/** Valor inicial de cada campo ao abrir o formulário */
function initialValue(field: FieldDef, record: RegistroCrud | null): any {
  if (record) {
    const raw = record[field.name];
    if (raw === null || raw === undefined) return '';
    if (field.type === 'boolean') return Number(raw) === 1;
    if (field.type === 'simnao') return String(raw).toUpperCase() === 'S';
    if (field.type === 'date') return toInputDate(raw);
    if (field.type === 'datetime') return toInputDateTime(raw);
    // A senha nunca vem do servidor: em branco mantém a atual
    if (field.type === 'password') return '';
    if (field.type === 'json') return typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
    return String(raw);
  }

  // Padrões sensatos para um registro novo
  switch (field.type) {
    case 'boolean':
    case 'simnao':
      return field.name === 'ativo';
    case 'enum':
      return field.required ? field.options?.[0]?.value ?? '' : '';
    default:
      return '';
  }
}

export const RecordForm: React.FC<RecordFormProps> = ({
  resource,
  record,
  refOptions,
  colunasLista,
  onAlternarColunaLista,
  onCancel,
  onSave,
}) => {
  const isEdit = Boolean(record);
  /** Registro aberto só para consulta: tela sem gravação (ex.: vendedores, que vêm do bmsoft) */
  const somenteLeitura = isEdit && !resource.canUpdate;

  const editableFields = useMemo(
    () =>
      resource.fields.filter((f) => {
        if (f.readOnly) return false;
        if (resource.autoIncrement && resource.pk.includes(f.name)) return false;
        // A chave composta não pode ser alterada depois de criada
        if (isEdit && !resource.autoIncrement && resource.pk.includes(f.name)) return false;
        return true;
      }),
    [resource, isEdit],
  );

  const readOnlyFields = useMemo(
    // Datas automáticas de criação/atualização não aparecem na edição
    () => resource.fields.filter((f) => f.readOnly && !f.automatico && record && record[f.name] != null),
    [resource, record],
  );

  const [values, setValues] = useState<Record<string, any>>(() => {
    const next: Record<string, any> = {};
    for (const f of editableFields) next[f.name] = initialValue(f, record);
    return next;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealPassword, setRevealPassword] = useState(false);
  // Recarrega o formulário quando a aba passa a apontar para outro registro
  useEffect(() => {
    const next: Record<string, any> = {};
    for (const f of editableFields) next[f.name] = initialValue(f, record);
    setValues(next);
    setError(null);
  }, [record, editableFields]);

  const setValue = (name: string, value: any) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Só o próprio formulário salva. Formulários de janelas abertas a partir daqui
    // (renderizadas em portal) também disparam este evento pela árvore do React.
    if (e.target !== e.currentTarget) return;
    setIsSaving(true);
    setError(null);

    try {
      const payload: RegistroCrud = {};
      for (const f of editableFields) {
        let v = values[f.name];
        if (f.type === 'boolean') v = v ? 1 : 0;
        if (f.type === 'simnao') v = v ? 'S' : 'N';
        payload[f.name] = v === '' ? null : v;
      }
      await onSave(payload);
    } catch (err: any) {
      setError(err.message || 'Não foi possível salvar o registro.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = `${INPUT_CLASS} w-full`;

  const renderField = (field: FieldDef) => {
    const value = values[field.name] ?? '';
    const inputId = `form-${resource.name}-${field.name}`;

    // Chave estrangeira: combo alimentado pelo recurso referenciado
    if (field.ref) {
      const options = refOptions[field.name] || [];
      return (
        <select
          id={inputId}
          value={String(value ?? '')}
          onChange={(e) => setValue(field.name, e.target.value)}
          required={Boolean(field.required)}
          className={`${inputClass} cursor-pointer`}
        >
          <option value="">{field.required ? '— Selecione —' : '— Nenhum —'}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} (#{o.value})
            </option>
          ))}
        </select>
      );
    }

    switch (field.type) {
      case 'boolean':
      case 'simnao':
        return <Toggle id={inputId} checked={Boolean(value)} onChange={(v) => setValue(field.name, v)} />;

      case 'enum':
        return (
          <select
            id={inputId}
            value={String(value ?? '')}
            onChange={(e) => setValue(field.name, e.target.value)}
            required={Boolean(field.required)}
            className={`${inputClass} cursor-pointer`}
          >
            {!field.required && <option value="">— Nenhum —</option>}
            {field.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );

      case 'textarea':
        return (
          <textarea
            id={inputId}
            value={String(value ?? '')}
            onChange={(e) => setValue(field.name, e.target.value)}
            rows={3}
            placeholder={field.placeholder}
            required={Boolean(field.required)}
            className={`${inputClass} resize-y`}
          />
        );

      case 'json':
        return (
          <textarea
            id={inputId}
            value={String(value ?? '')}
            onChange={(e) => setValue(field.name, e.target.value)}
            rows={4}
            spellCheck={false}
            placeholder='{"chave": "valor"}'
            className={`${inputClass} font-mono text-xs resize-y`}
          />
        );

      case 'password':
        return (
          <div className="relative">
            <input
              id={inputId}
              type={revealPassword ? 'text' : 'password'}
              value={String(value ?? '')}
              onChange={(e) => setValue(field.name, e.target.value)}
              autoComplete="new-password"
              placeholder={isEdit ? 'Deixe em branco para manter a senha atual' : 'Defina a senha inicial'}
              required={!isEdit}
              className={`${inputClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setRevealPassword((p) => !p)}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer"
            >
              {revealPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        );

      case 'number':
      case 'decimal':
        return (
          <NumberField
            id={inputId}
            value={value}
            onChange={(v) => setValue(field.name, v)}
            scale={field.type === 'decimal' ? field.scale ?? 2 : 0}
            allowNegative={field.allowNegative}
            required={Boolean(field.required)}
            className={inputClass}
          />
        );

      case 'date':
        return (
          <DateField
            id={inputId}
            value={String(value ?? '')}
            onChange={(v) => setValue(field.name, v)}
            required={Boolean(field.required)}
            className={inputClass}
          />
        );

      case 'datetime':
        return (
          <DateField
            id={inputId}
            value={String(value ?? '')}
            onChange={(v) => setValue(field.name, v)}
            required={Boolean(field.required)}
            withTime
            className={inputClass}
          />
        );

      default:
        return (
          <input
            id={inputId}
            type="text"
            value={String(value ?? '')}
            onChange={(e) => setValue(field.name, e.target.value)}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            required={Boolean(field.required)}
            className={inputClass}
          />
        );
    }
  };

  /** Campos longos ocupam a linha inteira do grid */
  const isWide = (f: FieldDef) => f.type === 'textarea' || f.type === 'json' || f.maxLength === 255;

  return (
    <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      {/* Corpo rolável */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-5xl mx-auto px-5 py-5 space-y-4">
          {somenteLeitura && (
            <div className="p-3 rounded-lg bg-stone-100 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 text-xs text-stone-600 dark:text-stone-300">
              Esta tela é só de consulta: {resource.label} não são alterados por aqui.
            </div>
          )}
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {editableFields.map((field) => {
              return (
                <div
                  key={field.name}
                  className={`${FIELD_CLASS} ${isWide(field) ? 'sm:col-span-2 lg:col-span-3' : ''}`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <label htmlFor={`form-${resource.name}-${field.name}`} className={`${LABEL_CLASS} truncate`}>
                      {field.label}
                      {field.required && <span className="text-rose-500 ml-1">*</span>}
                    </label>
                    {(() => {
                      const naLista = colunasLista.includes(field.name);
                      return (
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => onAlternarColunaLista(field.name)}
                          title={naLista ? 'Exibido na lista: clique para ocultar' : 'Oculto na lista: clique para exibir'}
                          className={`p-0.5 rounded transition-colors cursor-pointer shrink-0 ${
                            naLista
                              ? 'text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40'
                              : 'text-stone-300 hover:text-stone-500 hover:bg-stone-100 dark:text-stone-600 dark:hover:text-stone-400 dark:hover:bg-stone-800'
                          }`}
                        >
                          {naLista ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })()}
                  </div>
                  {/* fieldset desabilitado propaga o disabled para qualquer tipo de controle */}
                  <fieldset disabled={somenteLeitura} className="min-w-0 border-0 p-0 m-0">
                    {renderField(field)}
                  </fieldset>
                  {field.hint && <p className={HINT_CLASS}>{field.hint}</p>}
                </div>
              );
            })}
          </div>

          {/* Metadados gerados pelo banco */}
          {readOnlyFields.length > 0 && (
            <div className="pt-3 border-t border-stone-200 dark:border-stone-800">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-2">
                Dados gerados pelo banco
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {readOnlyFields.map((f) => (
                  <div
                    key={f.name}
                    className="bg-stone-50 dark:bg-stone-800/50 rounded-lg px-3 py-2 border border-stone-200 dark:border-stone-700/60"
                  >
                    <div className="text-[10px] text-stone-500 dark:text-stone-400">{f.label}</div>
                    <div className="text-xs font-mono text-stone-800 dark:text-stone-200 truncate">
                      {String(record?.[f.name] ?? '—')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Barra de ações fixa ao pé da tela */}
      <div className="px-5 py-3 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between gap-2.5 bg-stone-50 dark:bg-stone-950/40 shrink-0">
        <span className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
          {isEdit
            ? `Registro #${resource.pk.map((c) => record?.[c]).join(' / ')} • tabela ${resource.table}`
            : `Inclusão na tabela ${resource.table}`}
        </span>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold text-stone-600 dark:text-stone-300 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="w-3.5 h-3.5" />
            <span>{somenteLeitura ? 'Fechar' : 'Cancelar'}</span>
          </button>
          {!somenteLeitura && (
          <button
            type="submit"
            id="btn-salvar-registro"
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{isSaving ? 'Salvando…' : 'Salvar'}</span>
          </button>
          )}
        </div>
      </div>
    </form>
  );
};
