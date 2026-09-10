import { useTravel } from '../../services/travel/TravelContext'

/** 保存异常的具体原因放在编辑面板内；重新读取不会清空表单草稿。 */
export function TravelSaveFeedback({
  message,
  tripId,
}: {
  message: string
  tripId?: string
}) {
  const { error, saving, status, reload } = useTravel()
  return (
    <div className="formError" role="alert">
      <p>{message}</p>
      {error && <p>{error}</p>}
      {error && (
        <button
          type="button"
          className="textButton"
          disabled={saving || status === 'loading'}
          onClick={() => void reload({ preserveTripId: tripId })}
        >
          {status === 'loading' ? '正在重新读取…' : '保留输入并重新读取'}
        </button>
      )}
    </div>
  )
}
