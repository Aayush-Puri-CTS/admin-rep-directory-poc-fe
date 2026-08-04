import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateRep } from '../hooks/useReps';
import { REP_TYPES, type CreateRepBodyDto, type RepType } from '../api/types';
import { extractErrorMessage } from '../api/client';

const EMPTY: CreateRepBodyDto = {
  firstName: '',
  lastName: '',
  middleName: '',
  email: '',
  cellPhone: '',
  telephone: '',
  fax: '',
  num800: '',
  dateOfBirth: '',
  ssn: '',
  businessName: '',
  businessTaxId: '',
  businessEmail: '',
  uplineRepId: '',
  repType: undefined,
};

// Drop blank optional strings so they aren't sent as "" (the backend treats an absent
// field differently from an empty one for things like email format validation).
function toBody(form: CreateRepBodyDto): CreateRepBodyDto {
  const body: CreateRepBodyDto = { firstName: form.firstName, lastName: form.lastName, email: form.email };
  for (const key of [
    'middleName',
    'cellPhone',
    'telephone',
    'fax',
    'num800',
    'dateOfBirth',
    'ssn',
    'businessName',
    'businessTaxId',
    'businessEmail',
    'uplineRepId',
    'repType',
  ] as const) {
    const value = form[key];
    if (value) body[key] = value as never;
  }
  return body;
}

export function CreateRepPage() {
  const [form, setForm] = useState<CreateRepBodyDto>(EMPTY);
  const navigate = useNavigate();
  const createRep = useCreateRep();

  function update<K extends keyof CreateRepBodyDto>(key: K, value: CreateRepBodyDto[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createRep.mutate(toBody(form), {
      onSuccess: ({ repId }) => navigate(`/reps/${repId}`),
    });
  }

  return (
    <div className="page page--narrow">
      <h1>Create Rep</h1>
      <form className="form" onSubmit={handleSubmit}>
        <div className="form__row">
          <label>
            First name *
            <input required value={form.firstName} onChange={(e) => update('firstName', e.target.value)} />
          </label>
          <label>
            Middle name
            <input value={form.middleName} onChange={(e) => update('middleName', e.target.value)} />
          </label>
          <label>
            Last name *
            <input required value={form.lastName} onChange={(e) => update('lastName', e.target.value)} />
          </label>
        </div>

        <label>
          Email *
          <input type="email" required value={form.email} onChange={(e) => update('email', e.target.value)} />
        </label>

        <div className="form__row">
          <label>
            Cell phone
            <input value={form.cellPhone} onChange={(e) => update('cellPhone', e.target.value)} />
          </label>
          <label>
            Telephone
            <input value={form.telephone} onChange={(e) => update('telephone', e.target.value)} />
          </label>
          <label>
            Fax
            <input value={form.fax} onChange={(e) => update('fax', e.target.value)} />
          </label>
          <label>
            800 number
            <input value={form.num800} onChange={(e) => update('num800', e.target.value)} />
          </label>
        </div>

        <div className="form__row">
          <label>
            Date of birth
            <input type="date" value={form.dateOfBirth} onChange={(e) => update('dateOfBirth', e.target.value)} />
          </label>
          <label>
            SSN
            <input value={form.ssn} onChange={(e) => update('ssn', e.target.value)} />
          </label>
          <label>
            Rep type
            <select value={form.repType ?? ''} onChange={(e) => update('repType', (e.target.value || undefined) as RepType | undefined)}>
              <option value="">— none —</option>
              {REP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            Upline Rep ID (UUID)
            <input value={form.uplineRepId} onChange={(e) => update('uplineRepId', e.target.value)} />
          </label>
        </div>

        <fieldset>
          <legend>Business info (optional)</legend>
          <div className="form__row">
            <label>
              Business name
              <input value={form.businessName} onChange={(e) => update('businessName', e.target.value)} />
            </label>
            <label>
              Business tax ID
              <input value={form.businessTaxId} onChange={(e) => update('businessTaxId', e.target.value)} />
            </label>
            <label>
              Business email
              <input type="email" value={form.businessEmail} onChange={(e) => update('businessEmail', e.target.value)} />
            </label>
          </div>
        </fieldset>

        {createRep.isError && <p className="error-text">{extractErrorMessage(createRep.error)}</p>}

        <button type="submit" className="button button--primary" disabled={createRep.isPending}>
          {createRep.isPending ? 'Creating…' : 'Create Rep'}
        </button>
      </form>
    </div>
  );
}
