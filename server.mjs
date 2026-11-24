import express from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import multer from 'multer'
import nodemailer from 'nodemailer'
import { PGlite } from '@electric-sql/pglite'
import { randomBytes, createHash, scrypt as derive, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const app = express()
const db = new PGlite(process.env.DATA_DIR || './data')
const scrypt = promisify(derive)
const production = process.env.NODE_ENV === 'production'
if (production && !process.env.PUBLIC_ORIGIN?.startsWith('https://')) throw new Error('Production requires an HTTPS PUBLIC_ORIGIN')
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1)
const mail = process.env.SMTP_URL && process.env.MAIL_FROM ? nodemailer.createTransport(process.env.SMTP_URL, {connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000}) : null
const seed = JSON.parse(await readFile(new URL('./seed.json', import.meta.url), 'utf8'))
await db.exec(`
CREATE TABLE IF NOT EXISTS users(id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,name text NOT NULL,email text UNIQUE NOT NULL,password text NOT NULL,role text NOT NULL CHECK(role IN ('candidate','employer')), bio text NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS sessions(token text PRIMARY KEY, user_id integer REFERENCES users ON DELETE CASCADE, expires timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS jobs(id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,owner integer REFERENCES users,title text NOT NULL,company text NOT NULL,location text NOT NULL,category text NOT NULL,kind text NOT NULL,salary text NOT NULL,description text NOT NULL,tint text DEFAULT '#e4edff',ink text DEFAULT '#3158bb',created timestamptz DEFAULT now(),featured boolean DEFAULT false);
CREATE TABLE IF NOT EXISTS applications(id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,job_id integer REFERENCES jobs,candidate integer REFERENCES users,note text NOT NULL,resume bytea NOT NULL,status text NOT NULL DEFAULT 'Submitted',created timestamptz DEFAULT now(), UNIQUE(job_id,candidate));
CREATE TABLE IF NOT EXISTS notifications(id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,email text NOT NULL,subject text NOT NULL,body text NOT NULL,sent timestamptz);
`)
await db.transaction(async tx => {
  if ((await tx.query('SELECT 1 FROM jobs LIMIT 1')).rows.length) return
  for (const [index, job] of seed.entries()) {
    await tx.query('INSERT INTO jobs(title,company,location,category,kind,salary,description,tint,ink,featured) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [...job,index<3])
  }
})
const query = async (sql, args = []) => (await db.query(sql,args)).rows
const one = async (sql, args) => (await query(sql,args))[0]
const hash = token => createHash('sha256').update(token).digest('hex')
const cookie = req => req.headers.cookie?.match(/(?:^|;\s*)launch_session=([a-f0-9]{64})(?:;|$)/)?.[1]
const cookieOptions = { httpOnly:true, sameSite:'lax', secure:production, path:'/' }
const profile = 'id,name,email,role,bio'
const clean = (value, max = 160) => typeof value === 'string' ? value.trim().slice(0,max) : ''
const fail = (res, status, message) => res.status(status).json({error:message})
const jobId = req => /^\d{1,9}$/.test(req.params.id) ? Number(req.params.id) : 0

app.use(helmet({strictTransportSecurity:production ? undefined : false, contentSecurityPolicy:{directives:{upgradeInsecureRequests:production ? [] : null}}}))
app.use('/api', express.json({limit:'32kb'}), (req,res,next) => {
  res.set('Cache-Control','no-store')
  if (!['GET','HEAD'].includes(req.method)) {
    const origin = process.env.PUBLIC_ORIGIN || `http://${req.get('host')}`
    if (req.get('origin') && req.get('origin') !== origin) return fail(res,403,'Invalid request origin.')
  }
  next()
})
app.use('/api', async (req,res,next) => {
  const token = cookie(req)
  if (token) req.user = await one('SELECT u.id,u.name,u.email,u.role,u.bio FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=$1 AND s.expires>now()', [hash(token)])
  next()
})
const requireRole = role => (req,res,next) => {
  if (!req.user) return fail(res,401,'Please sign in first.')
  if (role && req.user.role !== role) return fail(res,403,`This action requires an ${role} account.`)
  next()
}
const authLimit = rateLimit({windowMs:15*60*1000,limit:30,message:{error:'Too many attempts. Try again later.'}})
async function signIn(req,res,user) {
  const previous = cookie(req)
  const token = randomBytes(32).toString('hex')
  await db.transaction(async tx => {
    await tx.query('DELETE FROM sessions WHERE expires<=now() OR token=$1',[previous ? hash(previous) : ''])
    await tx.query("INSERT INTO sessions VALUES($1,$2,now()+interval '7 days')",[hash(token),user.id])
  })
  res.cookie('launch_session',token,{...cookieOptions,maxAge:604800000}).json(user)
}
app.post('/api/register',authLimit,async (req,res) => {
  const {name,email,role,password} = req.body || {}
  const address = clean(email,254).toLowerCase()
  if (!clean(name,100) || !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(address) || !['candidate','employer'].includes(role) || typeof password !== 'string' || password.length<10 || password.length>128) return fail(res,400,'Enter a name, valid email, role, and a password of 10–128 characters.')
  const salt = randomBytes(16).toString('hex')
  const key = await scrypt(password,salt,64)
  const user = await one(`INSERT INTO users(name,email,password,role) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING RETURNING ${profile}`,[clean(name,100),address,`${salt}:${key.toString('hex')}`,role])
  if (!user) return fail(res,409,'An account already uses this email.')
  await signIn(req,res,user)
})
app.post('/api/login',authLimit,async (req,res) => {
  const {email,password} = req.body || {}
  if (typeof password !== 'string' || password.length>128) return fail(res,401,'Email or password is incorrect.')
  const user = await one(`SELECT ${profile},password FROM users WHERE email=$1`,[clean(email,254).toLowerCase()])
  const [salt,key] = user?.password.split(':') || ['invalid','0'.repeat(128)]
  const actual = await scrypt(password,salt,64)
  if (!timingSafeEqual(actual,Buffer.from(key,'hex')) || !user) return fail(res,401,'Email or password is incorrect.')
  delete user.password
  await signIn(req,res,user)
})
app.post('/api/logout',async (req,res) => {
  if (cookie(req)) await query('DELETE FROM sessions WHERE token=$1',[hash(cookie(req))])
  res.clearCookie('launch_session',cookieOptions).json({ok:true})
})
app.get('/api/me',(req,res)=>res.json(req.user || null))
app.put('/api/me',requireRole(),async (req,res) => {
  const name=clean(req.body?.name,100)
  if (!name) return fail(res,400,'Enter your name.')
  res.json(await one(`UPDATE users SET name=$1,bio=$2 WHERE id=$3 RETURNING ${profile}`,[name,clean(req.body.bio,2000),req.user.id]))
})
app.get('/api/jobs',async (req,res)=>{
  const {q,location,category,featured}=req.query
  res.json(await query(`SELECT * FROM jobs WHERE strpos(lower(title||' '||company||' '||description),lower($1))>0 AND strpos(lower(location),lower($2))>0 AND ($3='' OR category=$3) AND (NOT $4::boolean OR featured) ORDER BY CASE WHEN $4::boolean THEN id END ASC, id DESC LIMIT 200`,[clean(q),clean(location),clean(category),featured==='true']))
})
app.get('/api/jobs/:id',async (req,res)=>{
  const job=await one('SELECT * FROM jobs WHERE id=$1',[jobId(req)])
  if (!job) return fail(res,404,'Job not found.')
  res.json(job)
})
app.post('/api/jobs',requireRole('employer'),async (req,res)=>{
  const fields=['title','company','location','category','kind','salary','description']
  const values=fields.map(name=>clean(req.body?.[name],name==='description'?12000:160))
  if (values.some(value=>!value)) return fail(res,400,'Complete all job fields.')
  if (!['Design','Engineering','Marketing','Operations','Other'].includes(values[3]) || !['Full-time','Part-time','Contract','Internship'].includes(values[4])) return fail(res,400,'Choose a valid category and employment type.')
  res.status(201).json(await one('INSERT INTO jobs(owner,title,company,location,category,kind,salary,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[req.user.id,...values]))
})

const upload = multer({limits:{fileSize:5*1024*1024,files:1,fields:1,fieldSize:12000}})
const notify = (tx,email,subject,body) => tx.query('INSERT INTO notifications(email,subject,body) VALUES($1,$2,$3)',[email,subject,body])
app.post('/api/jobs/:id/apply',requireRole('candidate'),rateLimit({windowMs:60000,limit:10,message:{error:'Please wait a minute before trying again.'}}),upload.single('resume'),async (req,res)=>{
  const file=req.file
  if (!file || file.buffer.subarray(0,5).toString()!=='%PDF-') return fail(res,400,'Upload a PDF resume up to 5 MB.')
  const job=await one('SELECT title FROM jobs WHERE id=$1',[jobId(req)])
  if (!job) return fail(res,404,'Job not found.')
  const applied=await db.transaction(async tx=>{
    const result=await tx.query('INSERT INTO applications(job_id,candidate,note,resume) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id',[jobId(req),req.user.id,clean(req.body.note,3000),file.buffer])
    if (result.rows.length) await notify(tx,req.user.email,'Application received',`Your application for ${job.title} was received.`)
    return result.rows.length
  })
  if (!applied) return fail(res,409,'You have already applied for this job.')
  res.status(201).json({ok:true})
})
app.get('/api/dashboard',requireRole(),async (req,res)=>{
  const employer=req.user.role==='employer'
  const jobs=employer ? await query('SELECT * FROM jobs WHERE owner=$1 ORDER BY id DESC',[req.user.id]) : []
  const applications=await query(`SELECT a.id,a.note,a.status,a.created,j.title,j.company,j.id AS job_id,u.name FROM applications a JOIN jobs j ON a.job_id=j.id JOIN users u ON a.candidate=u.id WHERE ${employer?'j.owner':'a.candidate'}=$1 ORDER BY a.id DESC`,[req.user.id])
  res.json({jobs,applications})
})
app.get('/api/applications/:id/resume',requireRole(),async (req,res)=>{
  const row=await one('SELECT a.resume FROM applications a JOIN jobs j ON a.job_id=j.id WHERE a.id=$1 AND (a.candidate=$2 OR j.owner=$2)',[jobId(req),req.user.id])
  if (!row) return fail(res,404,'Resume not found.')
  res.attachment('resume.pdf').send(Buffer.from(row.resume))
})
app.patch('/api/applications/:id',requireRole('employer'),async (req,res)=>{
  const status=req.body?.status
  if (!['Submitted','In review','Interview','Accepted','Rejected'].includes(status)) return fail(res,400,'Choose a valid application status.')
  const found=await db.transaction(async tx=>{
    const result=await tx.query('UPDATE applications a SET status=$1 FROM jobs j,users u WHERE a.id=$2 AND j.id=a.job_id AND j.owner=$3 AND u.id=a.candidate AND a.status<>$1 RETURNING j.title,u.email',[status,jobId(req),req.user.id])
    const row=result.rows[0]
    if (row) await notify(tx,row.email,'Application status updated',`Your application for ${row.title} is now marked: ${status}.`)
    return row
  })
  if (!found) return fail(res,404,'No application status change was found.')
  res.json({ok:true})
})
let sending=false
if (mail) setInterval(async ()=>{
  if (sending) return
  sending=true
  try {
    for (const item of await query('SELECT * FROM notifications WHERE sent IS NULL ORDER BY id LIMIT 20')) {
      try {
        await mail.sendMail({from:process.env.MAIL_FROM,to:item.email,subject:item.subject,text:item.body,disableFileAccess:true,disableUrlAccess:true})
        await query('UPDATE notifications SET sent=now() WHERE id=$1',[item.id])
      } catch { console.error('Mail delivery failed for notification',item.id) }
    }
  } catch { console.error('Could not process notification queue') }
  finally { sending=false }
},10000).unref()
app.use('/api',(req,res)=>fail(res,404,'Endpoint not found.'))
const dist=fileURLToPath(new URL('./dist/',import.meta.url))
app.use(express.static(dist))
app.get('/{*path}',(req,res)=>res.sendFile('index.html',{root:dist}))
app.use((error,req,res,next)=>{
  if (res.headersSent) return next(error)
  if (error instanceof multer.MulterError) return fail(res,400,'Upload one PDF resume up to 5 MB.')
  if (error.status>=400 && error.status<500) return fail(res,error.status,'Invalid request.')
  console.error(error)
  fail(res,500,'Something went wrong. Please try again.')
})
app.listen(Number(process.env.PORT || 3000),process.env.HOST || '127.0.0.1',()=>console.log('Launchboard is ready'))
