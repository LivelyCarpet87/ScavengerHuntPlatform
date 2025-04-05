'use server'
import { openDb } from '@/app/actions/db' 
import {v6 as uuidv6} from 'uuid'
import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'

export async function register(state : any, formData: FormData) {
    if (!formData.has('acctName') || formData.get('acctName') === '') {
      return {
        errors: {
          name: "Invalid account name. Account name cannot be empty."
        },
      }
    }
    if (!formData.has('key')) {
      return {
        errors: {
          key: "Invalid key."
        },
      }
    }
    if (!formData.has('passwd') || formData.get('passwd') === '') {
      return {
        errors: {
          passwd: "Invalid password. Password cannot be empty."
        },
      }
    }
    const formSanitized = {
      acctName: formData.get('acctName')! as string,
      passwd: formData.get('passwd')! as string,
      key: formData.get('key')! as string,
    }
    if ( formSanitized.acctName.length > 32 ){
      return {
        errors: {
          name: "Invalid account name. Cannot be more than 32 characters."
        },
      }
    }
    if (formSanitized.key != process.env.TEAM_KEY! && formSanitized.key != process.env.ADMIN_KEY!) {
      return {
        errors: {
          key: "Invalid registration key."
        },
      }
    }
    const db = await openDb()

    if (formSanitized.key == process.env.TEAM_KEY!) {
      await db.run(
        'INSERT INTO accounts (acctName, acctGUID, passwdHash, priv) VALUES (?, ?, ?, ?);',
        formSanitized.acctName, 
        uuidv6(),
        bcrypt.hashSync(formSanitized.passwd),
        0
      )
    } else {
      await db.run(
        'INSERT INTO accounts (acctName, acctGUID, passwdHash, priv) VALUES (?, ?, ?, ?);',
        formSanitized.acctName, 
        uuidv6(),
        bcrypt.hashSync(formSanitized.passwd),
        10
      )
    }
    await db.close()
    redirect('/login') 
}