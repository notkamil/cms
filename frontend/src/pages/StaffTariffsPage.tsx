import { useCallback, useEffect, useMemo, useState } from 'react'
import { get, post, patch, del, put, ApiError } from '../api/client'
import { LoadingLogo } from '../components/LoadingLogo'
import '../pages/CabinetPage.css'
import '../pages/StaffCabinetPage.css'

const TARIFF_TYPE_LABELS: Record<string, string> = {
  fixed: 'Фикс',
  hourly: 'Почасовой',
  package: 'Пакет',
}

interface Tariff {
  id: number
  name: string
  type: string
  durationDays: number
  includedHours: number
  price: string
  isActive: boolean
  activeSubscriptionCount: number
  subscriptionCount: number
}

interface SpaceSummary {
  id: number
  name: string
}

interface TariffSpaceAssignment {
  tariffId: number
  spaceId: number
}

type ModalKind = 'add' | 'edit' | 'delete' | null

function assignmentKey(tariffId: number, spaceId: number): string {
  return `${tariffId}-${spaceId}`
}

function formatIncludedHours(hours: number): string {
  return hours === 0 ? 'Безлимит' : String(hours)
}

/** Валидация цены: неотрицательно, не более двух знаков после запятой (как пополнение баланса). Ноль разрешён. */
function validatePrice(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Укажите цену'
  if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(trimmed)) {
    return 'Цена: неотрицательное число, только цифры и точка, не более двух знаков после запятой'
  }
  const num = parseFloat(trimmed)
  if (num < 0) return 'Цена не может быть отрицательной'
  return null
}

export default function StaffTariffsPage() {
  const [tariffs, setTariffs] = useState<Tariff[]>([])
  const [spaces, setSpaces] = useState<SpaceSummary[]>([])
  const [assignments, setAssignments] = useState<TariffSpaceAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalKind>(null)
  const [editId, setEditId] = useState<number | null>(null)

  const [addName, setAddName] = useState('')
  const [addType, setAddType] = useState('fixed')
  const [addDurationDays, setAddDurationDays] = useState(0)
  const [addIncludedHours, setAddIncludedHours] = useState(0)
  const [addUnlimitedHours, setAddUnlimitedHours] = useState(false)
  const [addPrice, setAddPrice] = useState('')
  const [addIsActive, setAddIsActive] = useState(true)
  const [addError, setAddError] = useState<string | null>(null)
  const [addLoading, setAddLoading] = useState(false)

  const [editName, setEditName] = useState('')
  const [editDurationDays, setEditDurationDays] = useState(0)
  const [editIncludedHours, setEditIncludedHours] = useState(0)
  const [editUnlimitedHours, setEditUnlimitedHours] = useState(false)
  const [editPrice, setEditPrice] = useState('')
  const [editIsActive, setEditIsActive] = useState(true)
  const [editType, setEditType] = useState('')
  const [editActiveCount, setEditActiveCount] = useState(0)
  const [editError, setEditError] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)

  const [deleteSubscriptionCount, setDeleteSubscriptionCount] = useState(0) // всего подписок по тарифу
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [matrixEditMode, setMatrixEditMode] = useState(false)
  const [matrixDraft, setMatrixDraft] = useState<Set<string>>(new Set())
  const [matrixSaving, setMatrixSaving] = useState(false)

  const assignmentSet = useMemo(
    () => new Set(assignments.map((a) => assignmentKey(a.tariffId, a.spaceId))),
    [assignments]
  )
  const draftSet = matrixEditMode ? matrixDraft : assignmentSet

  const sortedTariffs = useMemo(
    () => [...tariffs].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [tariffs]
  )
  const sortedSpaces = useMemo(
    () => [...spaces].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [spaces]
  )

  const loadAll = useCallback(() => {
    setLoading(true)
    Promise.all([
      get<Tariff[]>('/api/staff/tariffs', true),
      get<{ id: number; name: string }[]>('/api/staff/spaces', true).then((list) =>
        list.map((s) => ({ id: s.id, name: s.name }))
      ),
      get<TariffSpaceAssignment[]>('/api/staff/tariff-spaces', true),
    ])
      .then(([tariffList, spaceList, assignmentList]) => {
        setTariffs(tariffList)
        setSpaces(spaceList)
        setAssignments(assignmentList)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const openAdd = () => {
    setAddName('')
    setAddType('fixed')
    setAddDurationDays(0)
    setAddIncludedHours(0)
    setAddUnlimitedHours(true)
    setAddPrice('')
    setAddIsActive(true)
    setAddError(null)
    setModal('add')
  }

  const openEdit = (row: Tariff) => {
    setEditId(row.id)
    setEditName(row.name)
    setEditType(row.type)
    setEditDurationDays(row.durationDays)
    setEditIncludedHours(row.includedHours)
    setEditUnlimitedHours(row.includedHours === 0)
    setEditPrice(row.price)
    setEditIsActive(row.isActive)
    setEditActiveCount(row.activeSubscriptionCount)
    setEditError(null)
    setModal('edit')
  }

  const openDelete = (row: Tariff) => {
    setEditId(row.id)
    setDeleteSubscriptionCount(row.subscriptionCount)
    setDeleteError(null)
    setModal('delete')
  }

  const closeModal = () => {
    setModal(null)
    setEditId(null)
    setAddError(null)
    setEditError(null)
    setDeleteError(null)
  }

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = addName.trim()
    if (!name) {
      setAddError('Название обязательно')
      return
    }
    const priceErr = validatePrice(addPrice)
    if (priceErr) {
      setAddError(priceErr)
      return
    }
    const isHourly = addType === 'hourly'
    const isFixed = addType === 'fixed'
    const includedHours = isHourly ? 1 : isFixed ? 0 : (addUnlimitedHours ? 0 : Math.max(0, Math.floor(addIncludedHours)))
    if (addType === 'package' && !addUnlimitedHours && includedHours < 1) {
      setAddError('Укажите количество часов (целое число ≥ 1) или включите «Безлимит»')
      return
    }
    const durationDays = isHourly ? 0 : Math.max(0, Math.floor(addDurationDays))
    setAddLoading(true)
    setAddError(null)
    try {
      await post<Tariff>(
        '/api/staff/tariffs',
        {
          name,
          type: addType,
          durationDays,
          includedHours,
          price: addPrice.trim(),
          isActive: addIsActive,
        },
        true
      )
      loadAll()
      closeModal()
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Ошибка при добавлении')
    } finally {
      setAddLoading(false)
    }
  }

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editId == null) return
    const name = editName.trim()
    if (!name) {
      setEditError('Название обязательно')
      return
    }
    const priceErr = validatePrice(editPrice)
    if (priceErr) {
      setEditError(priceErr)
      return
    }
    const isHourly = editType === 'hourly'
    const isFixed = editType === 'fixed'
    const includedHours = isHourly ? 1 : isFixed ? 0 : (editUnlimitedHours ? 0 : Math.max(0, Math.floor(editIncludedHours)))
    if (editType === 'package' && !editUnlimitedHours && includedHours < 1) {
      setEditError('Укажите количество часов (целое число ≥ 1) или включите «Безлимит»')
      return
    }
    const durationDays = isHourly ? 0 : Math.max(0, Math.floor(editDurationDays))
    setEditLoading(true)
    setEditError(null)
    try {
      await patch<Tariff>(
        `/api/staff/tariffs/${editId}`,
        {
          name,
          durationDays,
          includedHours,
          price: editPrice.trim(),
          isActive: editIsActive,
        },
        true
      )
      loadAll()
      closeModal()
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Ошибка при сохранении')
    } finally {
      setEditLoading(false)
    }
  }

  const submitDelete = async () => {
    if (editId == null || deleteSubscriptionCount > 0) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await del(`/api/staff/tariffs/${editId}`, true)
      loadAll()
      closeModal()
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Ошибка при удалении')
    } finally {
      setDeleteLoading(false)
    }
  }

  const canDelete = deleteSubscriptionCount === 0
  const canEditRestricted = editActiveCount === 0

  const startMatrixEdit = () => {
    setMatrixDraft(new Set(assignmentSet))
    setMatrixEditMode(true)
  }

  const cancelMatrixEdit = () => {
    setMatrixEditMode(false)
  }

  const saveMatrixEdit = async () => {
    setMatrixSaving(true)
    try {
      const list = Array.from(matrixDraft).map((key) => {
        const [t, s] = key.split('-').map(Number)
        return { tariffId: t, spaceId: s }
      })
      await put('/api/staff/tariff-spaces', { assignments: list }, true)
      setAssignments(list)
      setMatrixEditMode(false)
    } catch {
      // could set error state
    } finally {
      setMatrixSaving(false)
    }
  }

  const toggleMatrixCell = (tariffId: number, spaceId: number) => {
    if (!matrixEditMode) return
    const key = assignmentKey(tariffId, spaceId)
    setMatrixDraft((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (loading) {
    return (
      <div className="cabinet-loading-block">
        <LoadingLogo />
        <p className="cabinet-loading">Загрузка тарифов…</p>
      </div>
    )
  }

  return (
    <>
      <div className="staff-content staff-content--wider">
        <h2 className="cabinet-history-title">Тарифы</h2>

        <h3 className="cabinet-history-title" style={{ marginTop: '1rem', fontSize: '1rem' }}>
          Список тарифов
        </h3>
        {sortedTariffs.length === 0 ? (
          <p className="cabinet-history-empty">Нет тарифов</p>
        ) : (
          <table className="cabinet-table cabinet-history-table staff-space-types-table">
            <thead>
              <tr>
                <th scope="col">Название</th>
                <th scope="col">Тип</th>
                <th scope="col">Длительность (дней)</th>
                <th scope="col">Включ. часы</th>
                <th scope="col">Цена</th>
                <th scope="col">Активность</th>
                <th scope="col">Действия</th>
              </tr>
            </thead>
            <tbody>
              {sortedTariffs.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{TARIFF_TYPE_LABELS[row.type] ?? row.type}</td>
                  <td>{row.type === 'hourly' ? '—' : row.durationDays}</td>
                  <td>{formatIncludedHours(row.includedHours)}</td>
                  <td>{row.price}</td>
                  <td>{row.isActive ? 'Да' : 'Нет'}</td>
                  <td>
                    <div className="cabinet-table-actions-cell">
                      <button type="button" className="cabinet-edit-btn" onClick={() => openEdit(row)}>
                        Изменить
                      </button>
                      <button type="button" className="cabinet-password-btn" onClick={() => openDelete(row)}>
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="cabinet-actions">
          <button type="button" className="cabinet-edit-btn" onClick={openAdd}>
            Добавить тариф
          </button>
        </div>

        <h3 className="cabinet-history-title" style={{ marginTop: '1.5rem', fontSize: '1rem' }}>
          Пространства по тарифам
        </h3>
        {sortedTariffs.length === 0 || sortedSpaces.length === 0 ? (
          <p className="cabinet-history-empty">
            {sortedTariffs.length === 0 ? 'Добавьте тарифы' : 'Добавьте пространства'}
          </p>
        ) : (
          <>
            <div className="staff-matrix-wrap">
              <table className="staff-matrix-table staff-matrix-table--fit cabinet-table">
                <thead>
                  <tr>
                    <th scope="col" className="staff-matrix-amenity">
                      Тариф
                    </th>
                    {sortedSpaces.map((space) => (
                      <th key={space.id} scope="col" className="staff-matrix-space">
                        {space.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedTariffs.map((tariff) => (
                    <tr key={tariff.id}>
                      <td className="staff-matrix-amenity" style={{ textAlign: 'left' }}>
                        {tariff.name}
                      </td>
                      {sortedSpaces.map((space) => (
                        <td key={space.id}>
                          <input
                            type="checkbox"
                            checked={draftSet.has(assignmentKey(tariff.id, space.id))}
                            disabled={!matrixEditMode}
                            onChange={() => toggleMatrixCell(tariff.id, space.id)}
                            aria-label={`${tariff.name} — ${space.name}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="staff-matrix-actions cabinet-actions">
              {!matrixEditMode ? (
                <button type="button" className="cabinet-edit-btn" onClick={startMatrixEdit}>
                  Внести изменения
                </button>
              ) : (
                <>
                  <button type="button" className="cabinet-modal-cancel" onClick={cancelMatrixEdit}>
                    Отменить изменения
                  </button>
                  <button
                    type="button"
                    className="cabinet-modal-submit"
                    disabled={matrixSaving}
                    onClick={saveMatrixEdit}
                  >
                    {matrixSaving ? 'Сохранение…' : 'Сохранить изменения'}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {modal === 'add' && (
        <div className="cabinet-modal-overlay" onClick={closeModal}>
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cabinet-modal-title">Добавить тариф</h3>
            <form className="cabinet-modal-form" onSubmit={submitAdd}>
              {addError && <p className="cabinet-modal-error" role="alert">{addError}</p>}
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="add-name">Название *</label>
                <input
                  id="add-name"
                  type="text"
                  className="cabinet-modal-input"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  maxLength={64}
                  autoFocus
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="add-type">Тип *</label>
                <select
                  id="add-type"
                  className="cabinet-modal-input"
                  value={addType}
                  onChange={(e) => {
                    const v = e.target.value
                    setAddType(v)
                    if (v === 'hourly') {
                      setAddUnlimitedHours(false)
                      setAddIncludedHours(1)
                    } else if (v === 'fixed') {
                      setAddUnlimitedHours(true)
                      setAddIncludedHours(0)
                    }
                  }}
                >
                  <option value="fixed">Фикс</option>
                  <option value="hourly">Почасовой</option>
                  <option value="package">Пакет</option>
                </select>
              </div>
              {addType !== 'hourly' && (
                <div className="cabinet-modal-field">
                  <label className="cabinet-modal-label" htmlFor="add-duration">Длительность (дней)</label>
                  <input
                    id="add-duration"
                    type="number"
                    min={0}
                    step={1}
                    className="cabinet-modal-input"
                    value={addDurationDays || ''}
                    onChange={(e) => setAddDurationDays(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              )}
              <div className="cabinet-modal-field">
                <span className="cabinet-modal-label">Включ. часы</span>
                {addType === 'hourly' ? (
                  <p className="cabinet-modal-readonly">1 (фиксировано для почасового)</p>
                ) : addType === 'fixed' ? (
                  <p className="cabinet-modal-readonly">Безлимит (только для фикса)</p>
                ) : (
                  <>
                    <label className="cabinet-modal-label" style={{ fontWeight: 'normal', marginTop: '0.25rem' }}>
                      <input
                        type="checkbox"
                        checked={addUnlimitedHours}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setAddUnlimitedHours(checked)
                          if (checked) setAddIncludedHours(0)
                        }}
                      />
                      {' '}Безлимит
                    </label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="cabinet-modal-input"
                      value={addUnlimitedHours ? '' : addIncludedHours || ''}
                      onChange={(e) => setAddIncludedHours(parseInt(e.target.value, 10) || 0)}
                      disabled={addUnlimitedHours}
                      placeholder={addUnlimitedHours ? '—' : 'часов'}
                    />
                  </>
                )}
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="add-price">Цена * (₽)</label>
                <input
                  id="add-price"
                  type="text"
                  inputMode="decimal"
                  className="cabinet-modal-input"
                  value={addPrice}
                  onChange={(e) => setAddPrice(e.target.value)}
                  placeholder="0 или 0.00"
                />
                <p className="cabinet-modal-hint">Неотрицательно, не более двух знаков после запятой</p>
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label">
                  <input
                    type="checkbox"
                    checked={addIsActive}
                    onChange={(e) => setAddIsActive(e.target.checked)}
                  />
                  {' '}Активен (доступен для оформления)
                </label>
              </div>
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={closeModal}>
                  Отмена
                </button>
                <button type="submit" className="cabinet-modal-submit" disabled={addLoading}>
                  {addLoading ? 'Сохранение…' : 'Подтвердить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'edit' && (
        <div className="cabinet-modal-overlay" onClick={closeModal}>
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cabinet-modal-title">Изменить тариф</h3>
            <form className="cabinet-modal-form" onSubmit={submitEdit}>
              {editError && <p className="cabinet-modal-error" role="alert">{editError}</p>}
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="edit-name">Название *</label>
                <input
                  id="edit-name"
                  type="text"
                  className="cabinet-modal-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={64}
                  autoFocus
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label">Тип</label>
                <p className="cabinet-modal-readonly">{TARIFF_TYPE_LABELS[editType] ?? editType} (нельзя изменить)</p>
              </div>
              {editType !== 'hourly' && (
                <div className="cabinet-modal-field">
                  <label className="cabinet-modal-label" htmlFor="edit-duration">Длительность (дней)</label>
                  <input
                    id="edit-duration"
                    type="number"
                    min={0}
                    step={1}
                    className="cabinet-modal-input"
                    value={editDurationDays || ''}
                    onChange={(e) => setEditDurationDays(parseInt(e.target.value, 10) || 0)}
                    disabled={!canEditRestricted}
                  />
                  {!canEditRestricted && (
                    <p className="cabinet-modal-hint">Нельзя менять при активных подписках</p>
                  )}
                </div>
              )}
              <div className="cabinet-modal-field">
                <span className="cabinet-modal-label">Включ. часы</span>
                {editType === 'hourly' ? (
                  <p className="cabinet-modal-readonly">1 (фиксировано для почасового)</p>
                ) : editType === 'fixed' ? (
                  <p className="cabinet-modal-readonly">Безлимит (только для фикса)</p>
                ) : (
                  <>
                    <label className="cabinet-modal-label" style={{ fontWeight: 'normal', marginTop: '0.25rem' }}>
                      <input
                        type="checkbox"
                        checked={editUnlimitedHours}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setEditUnlimitedHours(checked)
                          if (checked) setEditIncludedHours(0)
                        }}
                        disabled={!canEditRestricted}
                      />
                      {' '}Безлимит
                    </label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="cabinet-modal-input"
                      value={editUnlimitedHours ? '' : editIncludedHours || ''}
                      onChange={(e) => setEditIncludedHours(parseInt(e.target.value, 10) || 0)}
                      disabled={editUnlimitedHours || !canEditRestricted}
                      placeholder={editUnlimitedHours ? '—' : 'часов'}
                    />
                  </>
                )}
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="edit-price">Цена * (₽)</label>
                <input
                  id="edit-price"
                  type="text"
                  inputMode="decimal"
                  className="cabinet-modal-input"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  disabled={!canEditRestricted}
                />
                <p className="cabinet-modal-hint">Неотрицательно, не более двух знаков после запятой</p>
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label">
                  <input
                    type="checkbox"
                    checked={editIsActive}
                    onChange={(e) => setEditIsActive(e.target.checked)}
                  />
                  {' '}Активен (доступен для оформления)
                </label>
              </div>
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={closeModal}>
                  Отмена
                </button>
                <button type="submit" className="cabinet-modal-submit" disabled={editLoading}>
                  {editLoading ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'delete' && (
        <div className="cabinet-modal-overlay" onClick={closeModal}>
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cabinet-modal-title">
              {deleteSubscriptionCount > 0 ? 'Удаление невозможно' : 'Удалить тариф?'}
            </h3>
            <div className="cabinet-modal-form">
              {deleteError && <p className="cabinet-modal-error" role="alert">{deleteError}</p>}
              {deleteSubscriptionCount > 0 ? (
                <p>По этому тарифу есть подписки ({deleteSubscriptionCount}). Удалить можно только при отсутствии подписок.</p>
              ) : (
                <p>Вы уверены, что хотите удалить этот тариф? Действие нельзя отменить.</p>
              )}
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={closeModal}>
                  {deleteSubscriptionCount > 0 ? 'Хорошо' : 'Отмена'}
                </button>
                {canDelete && (
                  <button
                    type="button"
                    className="cabinet-password-btn"
                    disabled={deleteLoading}
                    onClick={submitDelete}
                  >
                    {deleteLoading ? 'Удаление…' : 'Удалить'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
