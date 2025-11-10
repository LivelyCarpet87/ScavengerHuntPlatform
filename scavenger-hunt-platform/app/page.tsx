'use server'
import Link from 'next/link'
import jwt from 'jsonwebtoken'
import {cookies} from 'next/headers'
import { redirect } from 'next/navigation'

export default async function Home() {
  const cookieStore = await cookies()
  let user : AuthTokenData|null = null
  if (cookieStore.has('auth_token')) {
    const auth_token = cookieStore.get('auth_token')!.value!
    try {
      const decoded = jwt.verify(auth_token, process.env.JWT_SECRET_KEY!)
      if (decoded) {
        user= {
          acctName: (decoded as jwt.JwtPayload).acctName,
          acctGUID: (decoded as jwt.JwtPayload).acctGUID,
          privLv: (decoded as jwt.JwtPayload).privLv,
        }
      }
    } catch (error) {
      console.log(error)
    } finally {
      if (user!.privLv > 5) {
        redirect('/admin')
      }
    }
  }
  if (user != null) {
    return (
      <div>
          <main className="px-auto flex flex-col gap-10 items-center p-10">
            <p className="text-3xl font-bold">Welcome, {user.acctName}</p>
            <div className="flex flex-row gap-5 items-center flex-wrap">
              <Link className="p-2 rounded bg-blue-400 flex flex-row flex-nowrap gap-2 items-center w-64" href="/challenges">
                <p className='text-nowrap grow'>Challenges</p>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" className="w-5 h-5">
                  <path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/>
                </svg>
              </Link>
              <Link className="p-2 rounded bg-blue-400 flex flex-row flex-nowrap gap-2 items-center w-64" href="/competitions">
                <p className='text-nowrap grow'>Competitions</p>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" className="w-5 h-5">
                  <path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/>
                </svg>
              </Link>
              <Link className="p-2 rounded bg-blue-400 flex flex-row flex-nowrap gap-2 items-center w-64" href="/feedback">
                <p className='text-nowrap grow'>Submission Feedback</p>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" className="w-5 h-5">
                  <path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/>
                </svg>
              </Link>
              <Link className="p-2 rounded bg-blue-400 flex flex-row flex-nowrap gap-2 items-center w-64" href="/scoreboard">
                <p className='text-nowrap grow'>Check Scoreboard</p>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" className="w-5 h-5">
                  <path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/>
                </svg>
              </Link>
            </div>
          </main>
        </div>
    )
  }
  return (
    <div>
      <main className="px-auto flex flex-col gap-10 items-center p-10 flex-nowrap">
        <p className="text-3xl font-bold">You are not logged in.</p>
        <div className="flex flex-row gap-5 items-center">
          <Link className="p-2 rounded bg-blue-400 flex flex-row gap-2 items-center" href="/login">
            <p>Login</p>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" className="w-5 h-5">
              <path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/>
            </svg>
          </Link>
          <Link className="p-2 rounded bg-blue-400 flex flex-row gap-2 items-center" href="/register">
            <p>Register</p>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" className="w-5 h-5">
              <path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/>
            </svg>
          </Link>
        </div>
      </main>
    </div>
  );
}
