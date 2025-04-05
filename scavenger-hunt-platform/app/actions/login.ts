'use server'
import { openDb } from '@/app/actions/db' 
import {v6 as uuidv6} from 'uuid'
import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import jwt from 'jsonwebtoken'
import {cookies} from 'next/headers'

export async function login(state : any, formData: FormData) {
    if (!formData.has('acctName') || !formData.has('passwd') || formData.get('passwd') === '') {
      return {
        errors: "Invalid account name or password."
      }
    }
    const formSanitized = {
      acctName: formData.get('acctName')! as string,
      passwd: formData.get('passwd')! as string,
      key: formData.get('key')! as string,
    }
    const db = await openDb()
    const acct = await db.get(
      'SELECT * FROM accounts WHERE acctName = ? LIMIT 1;',
      formSanitized.acctName
    )
    await db.close()

    if (!acct) {
      bcrypt.compare(formSanitized.passwd,"$2b$10$3Xa2gODMgy/VOnH/0/fvLuyf8l14pn/z73q2zuklTjjpHfKB8xe2i")
      return {
        errors: "Invalid account name or password."
      }
    } else if (!await bcrypt.compare(formSanitized.passwd,acct.passwdHash)) {
      return {
        errors: "Invalid account name or password."
      }
    }

    const authTokenData: AuthTokenData = {
      acctName: formSanitized.acctName,
      acctGUID: acct.acctGUID,
      privLv: acct.priv
    };
    const authToken = jwt.sign(authTokenData, process.env.JWT_SECRET_KEY!)

    const cookieStore = await cookies()
    cookieStore.set('auth_token', authToken)
    
    redirect('/')
}