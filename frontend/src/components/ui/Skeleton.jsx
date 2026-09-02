export default function SkeletonGrid(){return <div className="grid-auto">{Array.from({length:8},(_,i)=><div className="skeleton h-32" key={i}/>)}</div>}

