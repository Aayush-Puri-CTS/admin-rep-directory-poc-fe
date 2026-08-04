import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  useLinkRepToGroup,
  useRep,
  useRepGroups,
  useRestoreRep,
  useSoftDeleteRep,
  useUpdateAccessControl,
  useUpdateBusinessInfo,
  useUpdatePersonalInfo,
} from '../hooks/useReps';
import { StatusBadge } from '../components/StatusBadge';
import { extractErrorMessage } from '../api/client';
import {
  REP_PLATFORMS,
  type BusinessInfoDto,
  type PlatformAccessType,
  type RepDetailView,
  type UpdatePersonalInfoBodyDto,
} from '../api/types';

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

export function RepDetailPage() {
  const { repId } = useParams<{ repId: string }>();
  const repQuery = useRep(repId);

  if (repQuery.isLoading) return <div className="page">Loading&hellip;</div>;
  if (repQuery.isError) return <div className="page error-text">{extractErrorMessage(repQuery.error)}</div>;
  if (!repQuery.data) return null;

  return <RepDetail rep={repQuery.data} repId={repId!} />;
}

function RepDetail({ rep, repId }: { rep: RepDetailView; repId: string }) {
  const softDelete = useSoftDeleteRep(repId);
  const restore = useRestoreRep(repId);
  const isDeleted = rep.status === 'SOFT_DELETED';

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1>
            {rep.firstName} {rep.middleName ? `${rep.middleName} ` : ''}
            {rep.lastName}
          </h1>
          <StatusBadge status={rep.status} />
          {rep.isEliteBlue && <span className="pill">Elite Blue</span>}
        </div>
        {isDeleted ? (
          <button
            type="button"
            className="button button--primary"
            disabled={restore.isPending}
            onClick={() => restore.mutate()}
          >
            {restore.isPending ? 'Restoring…' : 'Restore Rep'}
          </button>
        ) : (
          <button
            type="button"
            className="button button--danger"
            disabled={softDelete.isPending}
            onClick={() => {
              if (confirm('Soft-delete this Rep? Data is retained and can be restored later.')) {
                softDelete.mutate();
              }
            }}
          >
            {softDelete.isPending ? 'Deleting…' : 'Soft-delete Rep'}
          </button>
        )}
      </div>
      {(softDelete.isError || restore.isError) && (
        <p className="error-text">{extractErrorMessage(softDelete.error ?? restore.error)}</p>
      )}

      <PersonalInfoCard rep={rep} repId={repId} />
      <BusinessInfoCard rep={rep} repId={repId} />
      <AccessControlCard rep={rep} repId={repId} />
      <GroupsCard repId={repId} />
    </div>
  );
}

function PersonalInfoCard({ rep, repId }: { rep: RepDetailView; repId: string }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<UpdatePersonalInfoBodyDto>({
    firstName: rep.firstName,
    lastName: rep.lastName,
    middleName: rep.middleName ?? '',
    email: rep.email,
    cellPhone: rep.cellPhone ?? '',
    telephone: rep.telephone ?? '',
    fax: rep.fax ?? '',
    num800: rep.num800 ?? '',
    dateOfBirth: toDateInput(rep.dateOfBirth),
    ssn: '',
  });
  const mutation = useUpdatePersonalInfo(repId);

  function update<K extends keyof UpdatePersonalInfoBodyDto>(key: K, value: UpdatePersonalInfoBodyDto[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body: UpdatePersonalInfoBodyDto = { ...form };
    for (const key of ['middleName', 'cellPhone', 'telephone', 'fax', 'num800', 'dateOfBirth', 'ssn'] as const) {
      if (!body[key]) delete body[key];
    }
    mutation.mutate(body, { onSuccess: () => setEditing(false) });
  }

  if (!editing) {
    return (
      <section className="card">
        <div className="card__header">
          <h2>Personal Info</h2>
          <button type="button" className="button--ghost" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
        <dl className="deflist">
          <dt>Email</dt>
          <dd>{rep.email}</dd>
          <dt>Cell phone</dt>
          <dd>{rep.cellPhone ?? '—'}</dd>
          <dt>Telephone</dt>
          <dd>{rep.telephone ?? '—'}</dd>
          <dt>Fax</dt>
          <dd>{rep.fax ?? '—'}</dd>
          <dt>800 number</dt>
          <dd>{rep.num800 ?? '—'}</dd>
          <dt>Date of birth</dt>
          <dd>{rep.dateOfBirth ? new Date(rep.dateOfBirth).toLocaleDateString() : '—'}</dd>
        </dl>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Edit Personal Info</h2>
      <form className="form" onSubmit={submit}>
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
            SSN (write-only — the API never returns it, so this field is always blank on open;
            leave blank to omit it from this update)
            <input value={form.ssn} onChange={(e) => update('ssn', e.target.value)} />
          </label>
        </div>
        {mutation.isError && <p className="error-text">{extractErrorMessage(mutation.error)}</p>}
        <div className="form__actions">
          <button type="submit" className="button button--primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="button--ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}

function BusinessInfoCard({ rep, repId }: { rep: RepDetailView; repId: string }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<BusinessInfoDto>({
    businessName: rep.businessName ?? '',
    businessTaxId: rep.businessTaxId ?? '',
    businessEmail: rep.businessEmail ?? '',
  });
  const mutation = useUpdateBusinessInfo(repId);
  const hasBusinessInfo = rep.businessName !== null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const businessInfo: BusinessInfoDto = { businessName: form.businessName };
    if (form.businessTaxId) businessInfo.businessTaxId = form.businessTaxId;
    if (form.businessEmail) businessInfo.businessEmail = form.businessEmail;
    mutation.mutate({ businessInfo }, { onSuccess: () => setEditing(false) });
  }

  function clearBusinessInfo() {
    if (confirm('Remove business info from this Rep entirely?')) {
      mutation.mutate({ businessInfo: null });
    }
  }

  if (!editing) {
    return (
      <section className="card">
        <div className="card__header">
          <h2>Business Info</h2>
          <div className="card__actions">
            <button type="button" className="button--ghost" onClick={() => setEditing(true)}>
              {hasBusinessInfo ? 'Edit' : 'Add'}
            </button>
            {hasBusinessInfo && (
              <button type="button" className="button--ghost" onClick={clearBusinessInfo} disabled={mutation.isPending}>
                Clear
              </button>
            )}
          </div>
        </div>
        {hasBusinessInfo ? (
          <dl className="deflist">
            <dt>Business name</dt>
            <dd>{rep.businessName}</dd>
            <dt>Tax ID</dt>
            <dd>{rep.businessTaxId ?? '—'}</dd>
            <dt>Business email</dt>
            <dd>{rep.businessEmail ?? '—'}</dd>
          </dl>
        ) : (
          <p className="muted">No business info on file.</p>
        )}
        {mutation.isError && <p className="error-text">{extractErrorMessage(mutation.error)}</p>}
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Edit Business Info</h2>
      <form className="form" onSubmit={submit}>
        <div className="form__row">
          <label>
            Business name *
            <input
              required
              value={form.businessName}
              onChange={(e) => setForm({ ...form, businessName: e.target.value })}
            />
          </label>
          <label>
            Tax ID
            <input
              value={form.businessTaxId}
              onChange={(e) => setForm({ ...form, businessTaxId: e.target.value })}
            />
          </label>
          <label>
            Business email
            <input
              type="email"
              value={form.businessEmail}
              onChange={(e) => setForm({ ...form, businessEmail: e.target.value })}
            />
          </label>
        </div>
        {mutation.isError && <p className="error-text">{extractErrorMessage(mutation.error)}</p>}
        <div className="form__actions">
          <button type="submit" className="button button--primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="button--ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}

function AccessControlCard({ rep, repId }: { rep: RepDetailView; repId: string }) {
  const [editing, setEditing] = useState(false);
  const initial = Object.fromEntries(REP_PLATFORMS.map((p) => {
    const existing = rep.platformAccess.find((entry) => entry.platform === p);
    return [p, existing?.accessType ?? 'DISABLED'];
  })) as Record<string, PlatformAccessType>;
  const [access, setAccess] = useState(initial);
  const mutation = useUpdateAccessControl(repId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate(
      { entries: REP_PLATFORMS.map((platform) => ({ platform, accessType: access[platform] })) },
      { onSuccess: () => setEditing(false) },
    );
  }

  const currentByPlatform = Object.fromEntries(rep.platformAccess.map((e) => [e.platform, e.accessType]));

  return (
    <section className="card">
      <div className="card__header">
        <h2>Platform Access</h2>
        {!editing && (
          <button type="button" className="button--ghost" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <ul className="access-list">
          {REP_PLATFORMS.map((platform) => (
            <li key={platform}>
              <span>{platform}</span>
              <span className={`badge badge--${(currentByPlatform[platform] ?? 'DISABLED').toLowerCase()}`}>
                {currentByPlatform[platform] ?? 'DISABLED'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <form className="form" onSubmit={submit}>
          <ul className="access-list">
            {REP_PLATFORMS.map((platform) => (
              <li key={platform}>
                <span>{platform}</span>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={access[platform] === 'ENABLED'}
                    onChange={(e) =>
                      setAccess((a) => ({ ...a, [platform]: e.target.checked ? 'ENABLED' : 'DISABLED' }))
                    }
                  />
                  {access[platform]}
                </label>
              </li>
            ))}
          </ul>
          {mutation.isError && <p className="error-text">{extractErrorMessage(mutation.error)}</p>}
          <div className="form__actions">
            <button type="submit" className="button button--primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="button--ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function GroupsCard({ repId }: { repId: string }) {
  const groupsQuery = useRepGroups(repId);
  const linkGroup = useLinkRepToGroup(repId);
  const [groupId, setGroupId] = useState('');
  const [startDate, setStartDate] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = startDate ? { groupId, startDate } : { groupId };
    linkGroup.mutate(body, {
      onSuccess: () => {
        setGroupId('');
        setStartDate('');
      },
    });
  }

  return (
    <section className="card">
      <h2>Serviced Groups</h2>

      {groupsQuery.isLoading && <p>Loading&hellip;</p>}
      {groupsQuery.isError && <p className="error-text">{extractErrorMessage(groupsQuery.error)}</p>}
      {groupsQuery.data && (
        <table className="table">
          <thead>
            <tr>
              <th>Group ID</th>
              <th>Relationship</th>
              <th>Start date</th>
              <th>End date</th>
            </tr>
          </thead>
          <tbody>
            {groupsQuery.data.map((g) => (
              <tr key={g.groupId}>
                <td className="mono">{g.groupId}</td>
                <td>{g.relationshipType}</td>
                <td>{new Date(g.startDate).toLocaleDateString()}</td>
                <td>{g.endDate ? new Date(g.endDate).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
            {groupsQuery.data.length === 0 && (
              <tr>
                <td colSpan={4} className="table__empty">
                  No groups linked yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <form className="form form--inline" onSubmit={submit}>
        <label>
          Group ID (UUID)
          <input required value={groupId} onChange={(e) => setGroupId(e.target.value)} placeholder="No group-search API yet" />
        </label>
        <label>
          Start date
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <button type="submit" className="button button--primary" disabled={linkGroup.isPending}>
          {linkGroup.isPending ? 'Linking…' : 'Link Group'}
        </button>
      </form>
      {linkGroup.isError && <p className="error-text">{extractErrorMessage(linkGroup.error)}</p>}
    </section>
  );
}
