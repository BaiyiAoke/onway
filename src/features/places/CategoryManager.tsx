import { useState } from 'react'
import { ConfirmDialog, EditPanel } from '../../components/EditPanel'
import { useTravel } from '../../services/travel/TravelContext'
import type { PlaceCategory } from '../../services/travel/types'
import { TravelSaveFeedback } from '../travel/TravelSaveFeedback'
import forms from '../travel/Travel.module.css'
import styles from './Places.module.css'

export function CategoryManager({ onClose }: { onClose: () => void }) {
  const { workspace, run, saving } = useTravel()
  const [editing, setEditing] = useState<PlaceCategory | null>(null)
  const [name, setName] = useState('')
  const [deleting, setDeleting] = useState<PlaceCategory | null>(null)
  const [error, setError] = useState(false)
  if (deleting)
    return (
      <ConfirmDialog
        title="删除分类"
        message={
          '删除“' +
          deleting.name +
          '”后，地点库和行程中的相关地点改为未分类，地点本身保留。'
        }
        onClose={() => setDeleting(null)}
        onConfirm={() => run({ type: 'deleteCategory', id: deleting.id })}
        failure={<TravelSaveFeedback message="分类删除失败，请重试。" />}
      />
    )
  return (
    <EditPanel
      title="管理分类"
      onClose={onClose}
      dirty={name !== (editing?.name ?? '')}
      busy={saving}
    >
      <div className={forms.form}>
        <div className={styles.categories}>
          {workspace?.categories.map((category) => (
            <div key={category.id} className={styles.category}>
              <span>{category.name}</span>
              {category.builtin ? (
                <small className="muted">预置</small>
              ) : (
                <span className={styles.actions}>
                  <button
                    className="textButton"
                    disabled={saving}
                    onClick={() => {
                      setEditing(category)
                      setName(category.name)
                      setError(false)
                    }}
                  >
                    重命名
                  </button>
                  <button
                    className="textButton dangerText"
                    disabled={saving}
                    onClick={() => setDeleting(category)}
                  >
                    删除
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
        <form
          className={forms.form}
          onSubmit={(event) => {
            event.preventDefault()
            void run({ type: 'saveCategory', id: editing?.id, name }).then(
              (ok) => {
                setError(!ok)
                if (ok) {
                  setEditing(null)
                  setName('')
                }
              },
            )
          }}
        >
          <label>
            {editing ? '分类新名称' : '新增分类'}
            <input
              required
              maxLength={30}
              value={name}
              disabled={saving}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {error && <TravelSaveFeedback message="分类未保存，请重试。" />}
          <div className={forms.formActions}>
            {editing && (
              <button
                type="button"
                className="secondaryButton"
                disabled={saving}
                onClick={() => {
                  setEditing(null)
                  setName('')
                }}
              >
                取消重命名
              </button>
            )}
            <button className="primaryButton" disabled={saving}>
              {editing ? '保存名称' : '添加分类'}
            </button>
          </div>
        </form>
      </div>
    </EditPanel>
  )
}
