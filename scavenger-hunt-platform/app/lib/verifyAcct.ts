'use server'
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import jwt from 'jsonwebtoken'

export async function verifyAcct(){
    const cookieStore = await cookies()
    if (!cookieStore.has('auth_token')) {
        console.log('missing auth token')
        redirect('/')
    }
    const auth_token = cookieStore.get('auth_token')!.value!
    let user : AuthTokenData|null = null
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
        redirect('/')
    }

    return user
}