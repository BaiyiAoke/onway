import {
  ArrowRight,
  ArrowUpRight,
  MapPin,
  Mountain,
  NotebookPen,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { demoPlaces } from '../../data/demo'
import { NoteEditor } from './NoteEditor'
import styles from './Today.module.css'

export function TodayPage() {
  return (
    <div className="page">
      <div className="pageHeading">
        <div>
          <p className="eyebrow">YOUR DAY, YOUR WAY</p>
          <h1>今天，慢慢出发。</h1>
          <p className="muted">想去的地方，和路上的小事，都收在这里。</p>
        </div>
        <span className="tag">示例旅行 · 功能预览</span>
      </div>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.heroTag}>一段河西走廊的想象</span>
          <h2>
            沿着山脉，
            <br />
            向开阔处走。
          </h2>
          <p>兰州 · 武威 · 张掖</p>
          <Link to="/map" className={styles.heroLink}>
            打开旅行地图 <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className={styles.landscape} aria-hidden="true">
          <div className={styles.sun} />
          <div className={styles.ridgeBack} />
          <div className={styles.ridgeFront} />
          <div className={styles.road} />
          <span className={styles.landscapeLabel}>
            HEXI CORRIDOR / 河西走廊
          </span>
        </div>
      </section>
      <div className={styles.grid}>
        <section className="card">
          <div className={styles.sectionHeading}>
            <div>
              <p className="eyebrow">先看看这些地方</p>
              <h2>沿途三站</h2>
            </div>
            <MapPin size={20} className="muted" />
          </div>
          <ol className={styles.placeList}>
            {demoPlaces.map((place, index) => (
              <li key={place.id}>
                <span className={styles.number}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3>{place.name}</h3>
                  <p>{place.subtitle}</p>
                </div>
                <ArrowUpRight size={17} className="muted" />
              </li>
            ))}
          </ol>
          <Link className={styles.textLink} to="/plan">
            查看示例计划 <ArrowRight size={16} />
          </Link>
        </section>
        <NoteEditor />
      </div>
      <div className={styles.bottomNotes}>
        <span>
          <Mountain size={17} /> 示例地点为城市中心，不代表实际路线。
        </span>
        <span>
          <NotebookPen size={17} /> 无账号，备注保存在当前设备。
        </span>
      </div>
    </div>
  )
}
