import React, {useEffect,useState,createContext,useContext} from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter,Routes,Route,Link,NavLink,Navigate,useNavigate,useLocation,useParams,useSearchParams} from 'react-router-dom'
import {ArrowRight, ArrowUpRight, BriefcaseBusiness, Search, MapPin, LayoutGrid, Layers3, Command, Box, Sparkles, Check, FileText, Clock3, ChevronDown, Plus, Menu, X, Navigation} from 'lucide-react'
import './style.css'

const Session = createContext(null)
const categories=['Design','Engineering','Marketing','Operations','Other']
const types=['Full-time','Part-time','Contract','Internship']
const statuses=['Submitted','In review','Interview','Accepted','Rejected']
const brands={Layers:[Layers3,'violet'],Sisyphus:[Command,'blue'],Catalog:[Box,'mint']}
async function api(path,method='GET',data) {
  const form=data instanceof FormData
  const response=await fetch('/api'+path,{method,headers:data && !form ? {'Content-Type':'application/json'} : undefined,body:form?data:data?JSON.stringify(data):undefined})
  const result=await response.json()
  if (!response.ok) throw new Error(result.error || 'Something went wrong.')
  return result
}
function useData(url) {
  const [state,setState]=useState({})
  const [revision,setRevision]=useState(0)
  useEffect(()=>{
    let active=true
    setState({})
    api(url).then(data=>{if(active)setState({data})},error=>{if(active)setState({error:error.message})})
    return ()=>{active=false}
  },[url,revision])
  return {...state,reload:()=>setRevision(n=>n+1)}
}
function Notice({error,ok}) {return error || ok ? <p role={error?'alert':'status'} className={error?'error':'success'}>{error || ok}</p>:null}
function useSubmit() {
  const [state,set]=useState({})
  const submit=async (event,action)=>{
    event.preventDefault()
    if(state.busy)return
    const form=event.currentTarget
    set({busy:true})
    try {set({ok:await action(new FormData(form),form)})}
    catch(error){set({error:error.message})}
  }
  return {...state,submit}
}
function Logo(){return <Link to="/" className="logo"><span><Navigation size={19} fill="currentColor"/></span>Launchboard<span className="period">.</span></Link>}
function Header(){
  const {user}=useContext(Session)
  const [open,setOpen]=useState(false)
  const loc=useLocation()
  useEffect(()=>setOpen(false),[loc.pathname,loc.search])
  return <header><div className="wrap nav"><Logo/><button aria-label={open?'Close menu':'Open menu'} aria-expanded={open} className="mobile ghost" onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button><div className={'nav-links '+(open?'open':'')}><nav><NavLink end to="/">Home</NavLink><NavLink to="/jobs">Browse jobs</NavLink><NavLink to="/employers">For employers</NavLink></nav><div className="nav-actions"><Link to={user?'/dashboard':'/signin'}>{user?'Dashboard':'Log in'}</Link><Link className="button lime" to="/post"><Plus size={17}/> Post a job</Link></div></div></div></header>
}
function Illustration(){
  return <div className="visual" aria-hidden="true">
    <div className="orbit one"/><div className="orbit two"/><div className="orbit three"/>
    <Sparkles className="star star-a" size={25}/><Sparkles className="star star-b" size={17}/>
    <div className="mock">
      <div className="mock-top"><span/><span/><span/><small>YOUR NEXT ROLE</small></div>
      <div className="mock-main">
        <div className="mock-heading"><span><BriefcaseBusiness size={21}/></span><div>Explore opportunities<small>Jobs picked for you</small></div></div>
        <div className="mock-row"><span className="mini violet"><Layers3 size={18}/></span><div>Product Designer<small>Layers · Bengaluru</small></div><ArrowUpRight size={17}/></div>
        <div className="mock-row"><span className="mini blue"><Command size={18}/></span><div>Frontend Engineer<small>Sisyphus · Remote</small></div><ArrowUpRight size={17}/></div>
        <div className="mock-row faded"><span className="mini mint"><Box size={18}/></span><div>Marketing Lead<small>Catalog · Mumbai</small></div><ArrowUpRight size={17}/></div>
      </div>
    </div>
    <div className="float icon"><Navigation size={22} fill="currentColor"/></div>
    <div className="float applied"><span><Check size={19}/></span><div>Application sent<small>One step closer</small></div></div>
  </div>
}
function SearchBar({initial}){
  const navigate=useNavigate()
  return <form className="searchbar" onSubmit={e=>{
    e.preventDefault()
    const filter=new URLSearchParams()
    for(const [key,value] of new FormData(e.currentTarget)) if(value.trim()) filter.set(key,value.trim())
    navigate('/jobs'+(filter.size?'?'+filter:''))
  }}>
    <label><Search size={20}/><input aria-label="Job title or keyword" name="q" placeholder="Job title or keyword" defaultValue={initial?.get('q') || ''}/></label>
    <label><MapPin size={20}/><input aria-label="Location" name="location" placeholder="Location or remote" defaultValue={initial?.get('location') || ''}/></label>
    <label><LayoutGrid size={18}/><select aria-label="Category" name="category" defaultValue={initial?.get('category') || ''}><option value="">All categories</option>{categories.map(c=><option key={c}>{c}</option>)}</select><ChevronDown size={16}/></label>
    <button className="button primary"><Search size={18}/> Find jobs</button>
  </form>
}
function JobCard({job}){
  const [Icon,tone]=Object.hasOwn(brands,job.company) ? brands[job.company] : [BriefcaseBusiness,'blue']
  return <article className="job-card">
    <div className="job-top"><span className={'brand '+tone}><Icon size={24}/></span><span className="tag">{job.kind}</span></div>
    <div className="company">{job.company}</div><h3><Link to={'/jobs/'+job.id}>{job.title}</Link></h3>
    <div className="job-meta"><span><MapPin size={15}/>{job.location}</span><span>{job.category}</span></div>
    <div className="job-bottom"><strong>{job.salary}</strong><Link aria-label={'View '+job.title} to={'/jobs/'+job.id}><ArrowUpRight size={20}/></Link></div>
  </article>
}
function JobGrid({data,error}){
  if(error)return <Notice error={error}/>
  if(!data)return <p role="status">Loading jobs…</p>
  return data.length ? <div className="job-grid">{data.map(job=><JobCard key={job.id} job={job}/>)}</div> : <p className="panel">No jobs found. Try a different keyword or filter.</p>
}
function Home(){
  const featured=useData('/jobs?featured=true')
  return <>
    <section className="hero"><div className="wrap hero-inner">
      <div className="hero-copy"><div className="eyebrow"><span/> THE JOB BOARD FOR YOUR NEXT MOVE</div><h1>Find work<br/>worth <em>doing.</em></h1><p>Discover open roles that fit your skills, your goals, and where you want to go next.</p><Link className="button lime" to="/jobs">Explore jobs <ArrowRight size={19}/></Link></div>
      <Illustration/>
    </div></section>
    <div className="wrap home-search"><SearchBar/><div className="popular"><b>Popular searches</b>{['Design','Engineering','Remote','Marketing'].map(item=><Link key={item} to={'/jobs?'+(item==='Remote'?'location':'category')+'='+item}>{item}</Link>)}</div></div>
    <section className="wrap featured"><div className="section-head"><div><div className="kicker"><Sparkles size={16}/> HANDPICKED ROLES</div><h2>Featured jobs</h2><p>Explore a few opportunities from our job board.</p></div><Link className="button outline" to="/jobs">View all jobs <ArrowRight size={17}/></Link></div><JobGrid {...featured}/></section>
  </>
}
function Listings(){
  const [filters]=useSearchParams()
  const jobs=useData('/jobs?'+filters)
  return <main className="wrap content"><div className="kicker"><BriefcaseBusiness size={17}/> FIND YOUR NEXT ROLE</div><h1>Browse jobs</h1><SearchBar key={filters.toString()} initial={filters}/><div className="section-head listing-count"><p>{jobs.data ? `${jobs.data.length} ${jobs.data.length===1?'job':'jobs'} found` : ''}</p>{filters.size>0 && <Link to="/jobs">Clear filters</Link>}</div><JobGrid {...jobs}/></main>
}
function JobDetail(){
  const {id}=useParams()
  const job=useData('/jobs/'+id)
  const {user,loading}=useContext(Session)
  const form=useSubmit()
  const [applied,setApplied]=useState(false)
  if(!job.data)return <main className="wrap content">{job.error?<Notice error={job.error}/>:<p>Loading job…</p>}</main>
  const j=job.data
  return <main className="wrap content"><Link className="back" to="/jobs">← Browse jobs</Link>
    <div className="detail-head"><div className="kicker"><BriefcaseBusiness size={17}/> {j.company}</div><h1>{j.title}</h1><div className="job-meta"><span><MapPin size={16}/>{j.location}</span><span><Clock3 size={16}/>{j.kind}</span><span>{j.category}</span><strong>{j.salary}</strong></div></div>
    <div className="detail-grid"><section className="panel"><h2>About the role</h2><p className="preserve">{j.description}</p></section>
    <section className="panel"><h2>Apply for this job</h2>{applied?<Notice ok="Your application was submitted."/>:loading?<p>Loading…</p>:!user?<Link className="button primary" to={'/signin?next='+encodeURIComponent('/jobs/'+id)}>Log in to apply <ArrowRight size={17}/></Link>:user.role==='candidate'?<form className="stack" onSubmit={e=>form.submit(e,async data=>{await api('/jobs/'+id+'/apply','POST',data);setApplied(true)})}><label>Resume (PDF, up to 5 MB)<input required name="resume" type="file" accept="application/pdf,.pdf"/></label><label>Cover note (optional)<textarea name="note" maxLength={3000} rows={4}/></label><Notice error={form.error}/><button className="button primary" disabled={form.busy}>{form.busy?'Submitting…':'Submit application'}</button></form>:<p>Sign in with a candidate account to apply.</p>}</section></div>
  </main>
}
function Auth({ register = false }) {
  const { user, setUser, loading } = useContext(Session);
  const [params] = useSearchParams();
  const next = params.get('next');

  const destination =
    next && /^\/(?:post|jobs\/\d+)$/.test(next)
      ? next
      : '/dashboard';

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to={destination} replace />;
  if (loading) return <main className="wrap content">Loading…</main>;

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const data = Object.fromEntries(new FormData(e.currentTarget));
      const result = await api(
        register ? '/register' : '/login',
        'POST',
        data
      );
      setUser(result);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap content">
      <section className="panel auth">
        <div className="kicker">
          <Navigation size={17} /> LAUNCHBOARD
        </div>

        <h1>{register ? 'Create account' : 'Welcome back'}</h1>

        <form className="stack" onSubmit={handleSubmit}>
          {register && (
            <>
              <label>
                Name
                <input name="name" required maxLength={100} autoComplete="name" />
              </label>

              <label>
                Account type
                <select
                  name="role"
                  defaultValue={destination === '/post' ? 'employer' : 'candidate'}
                >
                  <option value="candidate">Candidate</option>
                  <option value="employer">Employer</option>
                </select>
              </label>
            </>
          )}

          <label>
            Email
            <input
              name="email"
              required
              type="email"
              maxLength={254}
              autoComplete="email"
            />
          </label>

          <label>
            Password
            <input
              name="password"
              required
              type="password"
              minLength={register ? 10 : undefined}
              maxLength={128}
              autoComplete={register ? 'new-password' : 'current-password'}
            />
          </label>

          {error && <Notice error={error} />}

          <button className="button primary" disabled={busy}>
            {busy ? 'Please wait…' : register ? 'Create account' : 'Log in'}
          </button>
        </form>

        <p>
          {register ? 'Already registered?' : 'New here?'}{' '}
          <Link
            to={
              (register ? '/signin' : '/register') +
              (next ? '?next=' + encodeURIComponent(next) : '')
            }
          >
            {register ? 'Log in' : 'Create an account'}
          </Link>
        </p>
      </section>
    </main>
  );
}
function Gate({children,employer=false}){
  const {user,loading,error}=useContext(Session)
  if(error)return <main className="wrap content"><Notice error={error}/></main>
  if(loading)return <main className="wrap content">Loading…</main>
  if(!user)return <Navigate replace to={'/signin'+(employer?'?next=%2Fpost':'')}/>
  if(employer && user.role!=='employer')return <main className="wrap content"><div className="panel"><h1>Post a job</h1><p>Sign in with an employer account to publish a job.</p><Link className="button outline" to="/dashboard">Go to dashboard</Link></div></main>
  return children
}
function PostJob(){
  const form=useSubmit()
  const navigate=useNavigate()
  return <main className="wrap content"><div className="panel editor"><h1>Post a job</h1><form className="stack" onSubmit={e=>form.submit(e,async data=>{const job=await api('/jobs','POST',Object.fromEntries(data));navigate('/jobs/'+job.id)})}>
    <div className="fields">{[['title','Job title'],['company','Company'],['location','Location'],['salary','Salary range']].map(([name,label])=><label key={name}>{label}<input name={name} required maxLength={160}/></label>)}
    <label>Category<select name="category">{categories.map(c=><option key={c}>{c}</option>)}</select></label><label>Employment type<select name="kind">{types.map(t=><option key={t}>{t}</option>)}</select></label></div>
    <label>Job description<textarea name="description" required maxLength={12000} rows={7}/></label><Notice error={form.error}/><button className="button primary" disabled={form.busy}>Publish job <ArrowRight size={18}/></button></form></div></main>
}
function StatusForm({item,reload}){
  const form=useSubmit()
  return <form className="status-form" onSubmit={e=>form.submit(e,async data=>{const status=data.get('status');if(status===item.status)return;await api('/applications/'+item.id,'PATCH',{status});reload()})}>
    <select aria-label={'Status for '+item.name} name="status" defaultValue={item.status}>{statuses.map(s=><option key={s}>{s}</option>)}</select><button className="button outline" disabled={form.busy}>Update</button><Notice error={form.error}/>
  </form>
}
function Dashboard(){
  const {user,setUser}=useContext(Session)
  const data=useData('/dashboard')
  const form=useSubmit()
  const [logoutError,setLogoutError]=useState('')
  const employer=user.role==='employer'
  return <main className="wrap content"><div className="section-head"><div><div className="kicker"><LayoutGrid size={16}/> {user.role.toUpperCase()}</div><h1>Dashboard</h1></div><button className="button outline" onClick={async()=>{try{await api('/logout','POST');setUser(null)}catch(e){setLogoutError(e.message)}}}>Log out</button></div><Notice error={logoutError}/>
    <div className="detail-grid dashboard"><section className="panel"><h2>Your profile</h2><p>{user.email}</p><form className="stack" onSubmit={e=>form.submit(e,async values=>{setUser(await api('/me','PUT',Object.fromEntries(values)));return 'Profile saved.'})}><label>Name<input name="name" required maxLength={100} defaultValue={user.name}/></label><label>{employer?'About your company':'About you'}<textarea name="bio" maxLength={2000} rows={4} defaultValue={user.bio}/></label><Notice {...form}/><button className="button primary" disabled={form.busy}>Save profile</button></form></section>
    <div className="stack">{employer && <section className="panel"><div className="section-head"><h2>Your jobs</h2><Link className="button primary" to="/post"><Plus size={16}/> Post a job</Link></div>{data.data?.jobs.map(j=><p key={j.id}><Link to={'/jobs/'+j.id}>{j.title} <ArrowUpRight size={14}/></Link></p>)}{data.data?.jobs.length===0 && <p>You haven’t posted a job yet.</p>}</section>}
    <section className="panel"><h2>{employer?'Applicants':'Your applications'}</h2><Notice error={data.error}/>{!data.data && !data.error && <p>Loading applications…</p>}{data.data?.applications.length===0 && <p>{employer?'No applications yet.':'You haven’t applied to any jobs yet.'}</p>}
    {data.data?.applications.map(item=><article className="application" key={item.id}><h3><Link to={'/jobs/'+item.job_id}>{item.title}</Link></h3><p>{employer?item.name:item.company} · {item.status}</p>{employer&&item.note&&<p className="preserve">{item.note}</p>}<a href={'/api/applications/'+item.id+'/resume'}><FileText size={15}/> Download resume</a>{employer&&<StatusForm item={item} reload={data.reload}/>}</article>)}</section></div></div>
  </main>
}
function Employers(){return <main className="wrap content"><section className="panel editor"><div className="kicker"><BriefcaseBusiness size={17}/> FOR EMPLOYERS</div><h1>Find your next teammate.</h1><p>Publish openings, review resumes, and update each candidate’s application status from your employer dashboard.</p><Link className="button primary" to="/post">Post a job <ArrowRight size={18}/></Link></section></main>}
function App(){
  const session=useData('/me')
  const [user,setUser]=useState(undefined)
  const loc=useLocation()
  useEffect(()=>window.scrollTo(0,0),[loc.pathname,loc.search])
  return <Session.Provider value={{user:user===undefined?session.data:user,setUser,loading:user===undefined&&session.data===undefined&&!session.error,error:session.error}}><Header/><div className="page"><Routes><Route path="/" element={<Home/>}/><Route path="/jobs" element={<Listings/>}/><Route path="/jobs/:id" element={<JobDetail key={loc.pathname}/>}/><Route path="/signin" element={<Auth key="login"/>}/><Route path="/register" element={<Auth key="register" register/>}/><Route path="/dashboard" element={<Gate><Dashboard/></Gate>}/><Route path="/post" element={<Gate employer><PostJob/></Gate>}/><Route path="/employers" element={<Employers/>}/><Route path="*" element={<main className="wrap content"><h1>Page not found</h1><Link to="/">Back to home</Link></main>}/></Routes></div><footer><div className="wrap"><Logo/><Link to="/jobs">Browse jobs</Link><Link to="/employers">For employers</Link></div></footer></Session.Provider>
}
createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>)
