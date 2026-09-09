import { MapPin, ArrowUpRight, Route } from 'lucide-react'
import { Link } from 'react-router-dom'
import { demoPlaces } from '../../data/demo'
import styles from './Plan.module.css'

export function PlanPage() {
  return (
    <div className="page">
      <div className="pageHeading">
        <div>
          <p className="eyebrow">ROOM FOR DETOURS</p>
          <h1>计划，留一点余地。</h1>
          <p className="muted">先收下想去的地方，再决定如何出发。</p>
        </div>
        <span className="tag">示例内容</span>
      </div>
      <section className={`card ${styles.intro}`}>
        <div>
          <h2>河西走廊 · 地点清单</h2>
          <p className="muted">3 个公开示例地点 · 尚未安排日期</p>
        </div>
        <Link className="primaryButton" to="/map">
          <MapPin size={16} />
          在地图上查看
        </Link>
      </section>
      <ol className={styles.list}>
        {demoPlaces.map((place, index) => (
          <li className={`card ${styles.place}`} key={place.id}>
            <span className={styles.index}>
              {String(index + 1).padStart(2, '0')}
            </span>
            <div>
              <h2>{place.name}</h2>
              <p>{place.subtitle}</p>
              <p className={styles.coordinates}>
                WGS84 · {place.coordinates.latitude.toFixed(4)},{' '}
                {place.coordinates.longitude.toFixed(4)}
              </p>
            </div>
            <a
              href={place.sourceUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`查看${place.name}坐标参考资料`}
            >
              资料来源
              <ArrowUpRight size={15} />
            </a>
          </li>
        ))}
      </ol>
      <aside className={styles.notice}>
        <Route size={21} />
        <div>
          <h3>先有方向，再有路线</h3>
          <p>
            按天安排、自驾路线、分段距离与预计时间将在后续加入。当前展示地点，不计算路线。
          </p>
        </div>
      </aside>
    </div>
  )
}
