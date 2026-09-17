import { useEffect, useRef, useState } from 'react'
import { EditPanel, ConfirmDialog } from '../../components/EditPanel'
import { useTravel } from '../../services/travel/TravelContext'
import { useRoutes } from '../../services/routes/RoutesContext'
import {
  DEFAULT_CONFIG,
  configFingerprint,
  daySegments,
  findRecord,
  MODE_LABELS,
  recordForRequest,
  segmentKey,
} from '../../services/routes/transport'
import { selectSegment } from '../../services/routes/segmentView'
import { formatDistance, formatDuration } from '../../services/routes/model'
import {
  validTransport,
  validInstant,
} from '../../services/routes/transportValidation'
import type {
  SegmentRequest,
  TrainJourney,
  FlightJourney,
  TransportConfig,
  TransportOption,
  TransportRecord,
} from '../../services/routes/transportTypes'
import type { Trip } from '../../services/travel/types'
import { todayLocalDate } from '../../services/travel/model'
import { MapServiceSettingsButton } from '../places/SearchPanel'
import forms from '../travel/Travel.module.css'
import styles from './Routes.module.css'

export function OptionDetails({ option }: { option: TransportOption }) {
  return (
    <div className={styles.optionDetails}>
      <p>
        {formatDistance(option.distanceMeters)} · 约{' '}
        {formatDuration(option.durationSeconds)}
      </p>
      <ol>
        {option.steps.map((s, i) => (
          <li key={i}>
            {s.instruction || '交通路段'}
            {/* 只展示服务返回的步骤指标，不能据此编造发车或到站时刻。 */}
            {(s.durationSeconds !== undefined ||
              s.distanceMeters !== undefined) && (
              <small>
                {[
                  s.durationSeconds !== undefined
                    ? '约 ' + formatDuration(s.durationSeconds)
                    : '',
                  s.distanceMeters !== undefined
                    ? formatDistance(s.distanceMeters)
                    : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </small>
            )}
            {s.departureStop && (
              <small>
                {s.departureStop} → {s.arrivalStop ?? '到达站'}
              </small>
            )}
          </li>
        ))}
      </ol>
      <p className={styles.hint}>
        {option.source} ·{' '}
        {new Date(option.calculatedAt).toLocaleString('zh-CN', {
          hour12: false,
        })}
      </p>
    </div>
  )
}
function inputTime(at: string) {
  return Number.isFinite(Date.parse(at))
    ? new Date(Date.parse(at) + 8 * 3600000).toISOString().slice(0, 16)
    : ''
}
function saveTime(at: string) {
  return at ? at + ':00+08:00' : ''
}
function scheduledAt(date: string, time: string) {
  return date + 'T' + time + ':00+08:00'
}
function defaultTransitDeparture(date: string | null) {
  if (!date) return undefined
  return date === todayLocalDate()
    ? ({ kind: 'now' } as const)
    : ({ kind: 'scheduled', at: scheduledAt(date, '09:00') } as const)
}
function configForMode(
  base: TransportConfig,
  mode: TransportConfig['mode'],
  date: string | null,
): TransportConfig {
  return {
    ...DEFAULT_CONFIG,
    ...base,
    mode,
    provider: mode === 'driving' ? base.provider : 'amap',
    departure:
      mode === 'transit'
        ? (base.departure ?? defaultTransitDeparture(date))
        : base.departure,
  }
}
function toFlight(train: TrainJourney): FlightJourney {
  const { departureStation, arrivalStation, ...common } = train
  return {
    ...common,
    departureAirport: departureStation,
    arrivalAirport: arrivalStation,
  }
}
function toTrain(flight: FlightJourney): TrainJourney {
  const { departureAirport, arrivalAirport, ...common } = flight
  return {
    ...common,
    departureStation: departureAirport,
    arrivalStation: arrivalAirport,
  }
}
function defaultTrain(request: SegmentRequest): TrainJourney {
  return {
    number: '',
    departureStation: request.from.name,
    arrivalStation: request.to.name,
    departureAt: '',
    arrivalAt: '',
    note: '',
  }
}
function journeyDateTime(at: string) {
  return inputTime(at).replace('T', ' ')
}
function JourneyDetails({ record }: { record: TransportRecord }) {
  const journey = record.config.mode === 'flight' ? record.flight : record.train
  if (!journey) return null
  const from =
    'departureAirport' in journey
      ? journey.departureAirport
      : journey.departureStation
  const to =
    'arrivalAirport' in journey
      ? journey.arrivalAirport
      : journey.arrivalStation
  return (
    <section className={styles.savedJourney} aria-label="已保存的交通记录">
      <h3>
        {MODE_LABELS[record.config.mode]} · {journey.number}
      </h3>
      <p>
        {from} → {to}
      </p>
      <p>
        {journeyDateTime(journey.departureAt)} →{' '}
        {journeyDateTime(journey.arrivalAt)}（北京时间）
      </p>
      {journey.note && <p>{journey.note}</p>}
      <small>手动记录 · {record.needsReview ? '待核对' : '已保存'}</small>
    </section>
  )
}
export function TransportEditor({
  trip,
  request,
  detached,
  initialMode,
  onClose,
}: {
  trip: Trip
  request: SegmentRequest
  detached?: TransportRecord
  initialMode?: TransportConfig['mode']
  onClose: () => void
}) {
  const { run, saving, error: saveError } = useTravel()
  const { segments, segmentController } = useRoutes()
  const [initial, setInitial] = useState(() => {
    const record = structuredClone(detached ?? recordForRequest(trip, request))
    if (initialMode)
      record.config = configForMode(record.config, initialMode, request.date)
    return record
  })
  const [config, setConfig] = useState<TransportConfig>(initial.config)
  const initialTrain =
    initial.train ??
    (initial.flight ? toTrain(initial.flight) : defaultTrain(request))
  const initialFlight = initial.flight ?? toFlight(initialTrain)
  const [train, setTrain] = useState<TrainJourney>(initialTrain)
  const [flight, setFlight] = useState<FlightJourney>(initialFlight)
  const manualTouched = useRef({
    train: !!initial.train,
    flight: !!initial.flight,
  })
  const [settingsOpen, setSettingsOpen] = useState(
    !!initialMode ||
      (!initial.selected &&
        !initial.train &&
        !initial.flight &&
        !selectSegment(segments, trip, request).option),
  )
  const pendingQuery = useRef<string | null>(null)
  const [error, setError] = useState('')
  const [retainSelected, setRetainSelected] = useState(false)
  const [confirmed, setConfirmed] = useState(!detached && !initial.needsReview)
  const manual = config.mode === 'train' || config.mode === 'flight'
  const journey = config.mode === 'flight' ? flight : train
  const departureField =
    config.mode === 'flight' ? 'departureAirport' : 'departureStation'
  const arrivalField =
    config.mode === 'flight' ? 'arrivalAirport' : 'arrivalStation'
  function updateJourney(key: string, value: string) {
    if (config.mode === 'flight') {
      manualTouched.current.flight = true
      setFlight({ ...flight, [key]: value })
    } else {
      manualTouched.current.train = true
      setTrain({ ...train, [key]: value })
    }
  }
  const dirty =
    JSON.stringify(config) !== JSON.stringify(initial.config) ||
    (config.mode === 'train' &&
      JSON.stringify(train) !== JSON.stringify(initialTrain)) ||
    (config.mode === 'flight' &&
      JSON.stringify(flight) !== JSON.stringify(initialFlight)) ||
    !!detached ||
    confirmed !== (!detached && !initial.needsReview) ||
    retainSelected
  // 等持久化数据被上下文采用后再查询，避免用保存前的输入发请求；控制器继续保护恢复标识。
  useEffect(() => {
    if (saving || pendingQuery.current !== configFingerprint(request)) return
    pendingQuery.current = null
    void segmentController.calculate(request)
  }, [saving, request, segmentController, initial])
  const view = selectSegment(segments, trip, request)
  const original =
    detached ?? findRecord(trip, request.dayId, request.from.id, request.to.id)
  const [expected, setExpected] = useState(() =>
    JSON.stringify(original ?? null),
  )
  const changedQuery = JSON.stringify(config) !== JSON.stringify(request.config)
  function showFormError(message: string) {
    setError(message)
    setSettingsOpen(true)
  }
  async function save(option?: TransportOption) {
    setError('')
    if ((detached || initial.needsReview) && !confirmed) {
      showFormError('请核对新的路段和时间后勾选确认。')
      return
    }
    if (config.mode === 'transit' && !config.departure) {
      showFormError('请选择公共交通出发时间。')
      return
    }
    if (
      config.mode === 'transit' &&
      config.departure?.kind === 'now' &&
      request.date !== todayLocalDate()
    ) {
      showFormError('这一天不是今天，请指定日期时间。')
      return
    }
    if (
      config.mode === 'transit' &&
      config.departure?.kind === 'scheduled' &&
      request.date &&
      inputTime(config.departure.at).slice(0, 10) !== request.date
    ) {
      showFormError('公共交通出发日期须与这一天一致。')
      return
    }
    if (
      config.mode === 'transit' &&
      config.departure?.kind === 'scheduled' &&
      !validInstant(config.departure.at)
    ) {
      showFormError('请输入有效的公共交通出发日期时间。')
      return
    }
    const next: TransportRecord = {
      ...initial,
      dayId: request.dayId,
      from: request.from,
      to: request.to,
      config: { ...config, reviewedDate: request.date },
      needsReview: false,
      train: config.mode === 'train' ? train : initial.train,
      flight: config.mode === 'flight' ? flight : initial.flight,
      selected: option
        ? { fingerprint: configFingerprint({ ...request, config }), option }
        : initial.selected && retainSelected && config.mode === 'transit'
          ? {
              ...initial.selected,
              confirmedFingerprint: configFingerprint({ ...request, config }),
            }
          : initial.selected,
    }
    if (!validTransport(next)) {
      showFormError(
        '请填写完整' +
          (config.mode === 'flight' ? '航班、机场' : '车次、站点') +
          '和有效时间，到达时间须晚于出发时间。',
      )
      return
    }
    if (
      manual &&
      request.date &&
      inputTime(journey.departureAt).slice(0, 10) !== request.date
    ) {
      showFormError(
        (config.mode === 'flight' ? '航班' : '车次') +
          '出发日期须与这一天一致，请调整关联日期。',
      )
      return
    }
    if (
      await run({
        type: 'saveTransport',
        tripId: trip.id,
        record: next,
        expected,
      })
    ) {
      if (manual || option || detached) {
        onClose()
        return
      }
      setInitial(next)
      setConfig(next.config)
      setExpected(JSON.stringify(next))
      setRetainSelected(false)
      pendingQuery.current = configFingerprint({
        ...request,
        config: next.config,
      })
      setSettingsOpen(false)
    }
  }
  function changeMode(mode: TransportConfig['mode']) {
    // 类型由用户主动选择。首次切换时沿用可对应字段，已有目标类型记录保持原样。
    if (
      mode === 'flight' &&
      config.mode === 'train' &&
      !manualTouched.current.flight
    )
      setFlight(toFlight(train))
    if (
      mode === 'train' &&
      config.mode === 'flight' &&
      !manualTouched.current.train
    )
      setTrain(toTrain(flight))
    setConfig(configForMode(config, mode, request.date))
  }
  function applyTransitTime(time: string) {
    if (!request.date) return
    setConfig({
      ...config,
      departure: { kind: 'scheduled', at: scheduledAt(request.date, time) },
    })
  }
  return (
    <EditPanel
      title={detached ? '重新关联交通' : '交通详情'}
      onClose={onClose}
      dirty={dirty}
      busy={saving}
    >
      {(requestClose) => (
        <form
          noValidate
          className={forms.form}
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <p className={styles.endpoints}>
            {request.from.name} → {request.to.name}
          </p>
          {initial.selected && initial.config.mode === 'transit' && (
            <section
              className={styles.savedJourney}
              aria-label="已保存的公共交通方案"
            >
              <h3>已保存的公共交通方案{view.needsReview ? ' · 待确认' : ''}</h3>
              <OptionDetails option={initial.selected.option} />
            </section>
          )}
          {initial.selected && initial.config.mode !== 'transit' && (
            <details className={styles.details}>
              <summary>保留的公共交通方案</summary>
              <OptionDetails option={initial.selected.option} />
            </details>
          )}
          {['train', 'flight'].includes(initial.config.mode) && (
            <JourneyDetails record={initial} />
          )}
          {!changedQuery && !manual && view.cache && (
            <section>
              <h3>
                {initial.selected ? '可更新的建议' : '查询结果'}
                {view.expired ? ' · 上次估算' : ''}
              </h3>
              {view.cache.result.options.map((option, i) => (
                <article key={option.id} className={styles.option}>
                  <details open={i === 0 && !initial.selected}>
                    <summary>
                      方案 {i + 1} · {formatDuration(option.durationSeconds)} ·{' '}
                      {formatDistance(option.distanceMeters)}
                    </summary>
                    <OptionDetails option={option} />
                  </details>
                  {config.mode === 'transit' && (
                    <button
                      type="button"
                      className="secondaryButton"
                      disabled={
                        saving || !!detached || view.expired || view.unsaved
                      }
                      onClick={() => void save(option)}
                    >
                      采用此方案
                    </button>
                  )}
                </article>
              ))}
            </section>
          )}
          <button
            type="button"
            className="secondaryButton"
            aria-expanded={settingsOpen}
            aria-controls="transport-settings"
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            {settingsOpen ? '收起交通设置' : '修改交通设置'}
          </button>
          <div
            id="transport-settings"
            hidden={!settingsOpen}
            className={styles.settingsFields}
          >
            <label>
              交通方式
              <select
                aria-label="交通方式"
                value={config.mode}
                disabled={saving}
                onChange={(e) =>
                  changeMode(e.target.value as TransportConfig['mode'])
                }
              >
                {Object.entries(MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {config.mode === 'driving' && (
              <label>
                路线来源
                <select
                  value={config.provider}
                  disabled={saving}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      provider: e.target.value as TransportConfig['provider'],
                    })
                  }
                >
                  <option value="amap">高德地图</option>
                  <option value="osrm">OSRM</option>
                </select>
              </label>
            )}
            {config.mode === 'transit' && (
              <>
                <label>
                  换乘偏好
                  <select
                    value={config.strategy}
                    disabled={saving}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        strategy: Number(e.target.value) as 0 | 2 | 7,
                      })
                    }
                  >
                    <option value={0}>推荐方案</option>
                    <option value={7}>地铁优先</option>
                    <option value={2}>少换乘</option>
                  </select>
                </label>
                {request.date && (
                  <div className={styles.quickTimes}>
                    <span>常用时间</span>
                    {request.date === todayLocalDate() && (
                      <button
                        type="button"
                        className="textButton"
                        disabled={saving}
                        onClick={() =>
                          setConfig({ ...config, departure: { kind: 'now' } })
                        }
                      >
                        现在
                      </button>
                    )}
                    {['08:00', '09:00', '14:00', '18:00', '20:00'].map(
                      (time) => (
                        <button
                          key={time}
                          type="button"
                          className="textButton"
                          disabled={saving}
                          onClick={() => applyTransitTime(time)}
                        >
                          {time}
                        </button>
                      ),
                    )}
                  </div>
                )}
                <label>
                  出发时间
                  <select
                    value={config.departure?.kind ?? ''}
                    disabled={saving}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        departure:
                          e.target.value === 'now'
                            ? { kind: 'now' }
                            : { kind: 'scheduled', at: '' },
                      })
                    }
                  >
                    <option value="" disabled>
                      请选择时间
                    </option>
                    {request.date === todayLocalDate() && (
                      <option value="now">现在出发</option>
                    )}
                    <option value="scheduled">指定日期时间</option>
                  </select>
                </label>
                {config.departure?.kind === 'scheduled' && (
                  <label>
                    北京时间
                    <input
                      type="datetime-local"
                      required
                      value={inputTime(config.departure.at)}
                      disabled={saving}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          departure: {
                            kind: 'scheduled',
                            at: saveTime(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                )}
                <small>
                  按该段独立查询，不推算前一段到达时间。缺少城市信息时自动识别。
                </small>
              </>
            )}
            {manual && (
              <>
                {(
                  [
                    ['number', config.mode === 'flight' ? '航班号' : '车次'],
                    [
                      departureField,
                      config.mode === 'flight' ? '出发机场' : '出发站',
                    ],
                    [
                      arrivalField,
                      config.mode === 'flight' ? '到达机场' : '到达站',
                    ],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      required
                      maxLength={120}
                      value={String(
                        (journey as unknown as Record<string, string>)[key],
                      )}
                      disabled={saving}
                      onChange={(e) => updateJourney(key, e.target.value)}
                    />
                  </label>
                ))}
                {(
                  [
                    ['departureAt', '出发日期时间'],
                    ['arrivalAt', '到达日期时间'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}（北京时间）
                    <input
                      type="datetime-local"
                      required
                      value={inputTime(journey[key])}
                      disabled={saving}
                      onChange={(e) =>
                        updateJourney(key, saveTime(e.target.value))
                      }
                    />
                  </label>
                ))}
                <label>
                  {config.mode === 'flight' ? '航班备注' : '车次备注'}
                  <textarea
                    value={journey.note}
                    disabled={saving}
                    onChange={(e) => updateJourney('note', e.target.value)}
                  />
                </label>
                {initial.config.mode !== config.mode &&
                  (initial.train || initial.flight) && (
                    <small>
                      已沿用可对应的记录内容，请核对号码、机场或车站与日期时间后保存。
                    </small>
                  )}
                <small>
                  手动记录已确定的{config.mode === 'flight' ? '航班' : '车次'}
                  。跨午夜请填写实际到达日期；此处时间均为北京时间。
                </small>
              </>
            )}
          </div>
          {(detached || initial.needsReview) && (
            <label className={styles.reviewCheck}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              我已核对路段和出发、到达时间
            </label>
          )}
          {!manual && (
            <>
              <div className={styles.transportActions}>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={
                    saving ||
                    changedQuery ||
                    !!detached ||
                    view.busy ||
                    segments.status !== 'ready'
                  }
                  onClick={() => void segmentController.calculate(request)}
                >
                  {view.busy ? '查询中…' : '刷新方案'}
                </button>
                <MapServiceSettingsButton />
              </div>
              {changedQuery && (
                <small>
                  保存并查询后在此查看结果；已有方案会保留，采用新方案后才更新。
                </small>
              )}
            </>
          )}
          {view.operation?.error && (
            <div role="alert" className="formError">
              {view.operation.error}
              {view.unsaved && (
                <button
                  type="button"
                  className="textButton"
                  disabled={saving}
                  onClick={() => void segmentController.retrySave(request)}
                >
                  重试保存路线
                </button>
              )}
            </div>
          )}
          {initial.selected &&
            config.mode === 'transit' &&
            (view.needsReview || !!detached) && (
              <label className={styles.reviewCheck}>
                <input
                  type="checkbox"
                  checked={retainSelected}
                  onChange={(e) => setRetainSelected(e.target.checked)}
                />
                我已核对原方案，确认将它用于当前路段和时间
              </label>
            )}
          {(error || saveError) && (
            <p role="alert" className="formError">
              {error || saveError}
            </p>
          )}
          <div className={forms.formActions}>
            <button
              type="button"
              className="secondaryButton"
              onClick={requestClose}
              disabled={saving}
            >
              关闭
            </button>
            <button className="primaryButton" disabled={saving}>
              {saving ? '保存中…' : manual ? '保存记录' : '保存并查询'}
            </button>
          </div>
        </form>
      )}
    </EditPanel>
  )
}
export function DetachedTransport({ trip }: { trip: Trip }) {
  const { run, saving } = useTravel()
  const [opened, setOpened] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [target, setTarget] = useState('')
  const [editing, setEditing] = useState(false)
  const records = trip.transport?.filter((r) => r.dayId === null) ?? []
  const record = records.find((r) => r.id === selected)
  const requests = trip.days
    .flatMap((d) => daySegments(trip, d))
    .filter((r) => !findRecord(trip, r.dayId, r.from.id, r.to.id))
  const request = requests.find((r) => segmentKey(r) === target)
  if (!records.length) return null
  return (
    <>
      <button className="secondaryButton" onClick={() => setOpened(true)}>
        待关联交通 · {records.length}
      </button>
      {deleting && (
        <ConfirmDialog
          title="删除交通记录"
          message="确认删除这条待关联交通记录？"
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            run({
              type: 'deleteTransport',
              tripId: trip.id,
              recordId: deleting,
            })
          }
        />
      )}
      {opened && !editing && !deleting && (
        <EditPanel
          title="待关联交通"
          onClose={() => setOpened(false)}
          busy={saving}
        >
          <div className={forms.form}>
            <p>以下记录暂不计入当天汇总，重新关联后请核对时间。</p>
            {records.map((r) => (
              <article className={styles.option} key={r.id}>
                <strong>
                  {r.from.name} → {r.to.name}
                </strong>
                <p>
                  {MODE_LABELS[r.config.mode]}
                  {r.config.mode === 'flight' && r.flight
                    ? ' · ' + r.flight.number
                    : r.train
                      ? ' · ' + r.train.number
                      : ''}
                </p>
                {r.train && (
                  <p>
                    {r.train.departureStation} → {r.train.arrivalStation}
                    <br />
                    {inputTime(r.train.departureAt).replace('T', ' ')} 至{' '}
                    {inputTime(r.train.arrivalAt).replace('T', ' ')}
                    <br />
                    {r.train.note}
                  </p>
                )}
                {r.flight && (
                  <p>
                    航班 {r.flight.number}
                    <br />
                    {r.flight.departureAirport} → {r.flight.arrivalAirport}
                    <br />
                    {journeyDateTime(r.flight.departureAt)} 至{' '}
                    {journeyDateTime(r.flight.arrivalAt)}
                    <br />
                    {r.flight.note}
                  </p>
                )}
                {r.selected && (
                  <details>
                    <summary>原方案</summary>
                    <OptionDetails option={r.selected.option} />
                  </details>
                )}
                <div className={styles.transportActions}>
                  <button
                    className="secondaryButton"
                    onClick={() => {
                      setSelected(r.id)
                      setTarget('')
                    }}
                  >
                    选择新路段
                  </button>
                  <button
                    className="textButton dangerText"
                    disabled={saving}
                    onClick={() => setDeleting(r.id)}
                  >
                    删除记录
                  </button>
                </div>
              </article>
            ))}
            {record && (
              <>
                <label>
                  关联到
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">请选择空闲路段</option>
                    {requests.map((r) => (
                      <option key={segmentKey(r)} value={segmentKey(r)}>
                        第 {trip.days.findIndex((d) => d.id === r.dayId) + 1} 天
                        · {r.from.name} → {r.to.name}
                      </option>
                    ))}
                  </select>
                </label>
                {!requests.length && (
                  <p>当前没有空闲的相邻路段，可先安排地点。</p>
                )}
                <button
                  className="primaryButton"
                  disabled={!request}
                  onClick={() => setEditing(true)}
                >
                  核对并关联
                </button>
              </>
            )}
          </div>
        </EditPanel>
      )}
      {opened && editing && record && request && (
        <TransportEditor
          trip={trip}
          request={request}
          detached={record}
          onClose={() => {
            setEditing(false)
            setSelected(null)
          }}
        />
      )}
    </>
  )
}
