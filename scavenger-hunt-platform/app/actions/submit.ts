'use server'
import { openDb } from '@/app/actions/db' 
import {v6 as uuidv6} from 'uuid'
import { redirect } from 'next/navigation'
import {cookies} from 'next/headers'
import jwt from 'jsonwebtoken'
import { verifyAcct } from '../lib/verifyAcct'
import fs from 'fs'
import { revalidatePath } from 'next/cache'

export async function submit(state : any, formData: FormData) {
    const user = await verifyAcct()
    const challGUID = formData.get('challGUID')! as string
    const file_submission = formData.get('file-submission') as Blob | undefined
    const text_submission = formData.get('text-submission') as string | undefined

    if (!formData.has('challGUID')) {
        return {
            errors: "ERR: Challenge GUID missing."
        }
    }
    if (!formData.has('text-submission') || !formData.has('file-submission')) {
        return {
            errors: "ERR: No content submitted."
        }
    }
    const textSub = (formData.get('text-submission') as string)
    const fileSub = (formData.get('file-submission') as File)
    if (textSub.length == 0 && fileSub.size == 0 ) {
        return {
            errors: "ERR: No content submitted."
        }
    }
    if (fileSub.size > 10**9){
        return {
            errors: "ERR: File too large."
        }
    }

    const db = await openDb()
    const chall = await db.get(
      'SELECT * FROM challenges WHERE challGUID = ? LIMIT 1;',
      challGUID
    )
    if (!chall) {
        await db.close()
        return {
            errors: "ERR: Invalid challGUID."
        }
    }

    const submGUID = uuidv6()
    if (fileSub.size > 0){
        const fileGUID = uuidv6()
        const filepath = './public/files/'+fileGUID+ (/.*(\.[A-Za-z0-9]+)/gm.exec(fileSub.name))![1]
        fs.writeFileSync(
            filepath,
            Buffer.from(await fileSub.arrayBuffer())
        )

        await db.run(
            'INSERT INTO files (fileGUID, assocGUID, filename) VALUES (?, ?, ?);',
            fileGUID, 
            submGUID,
            fileSub.name
        )
    }
    
    await db.run(
        'INSERT INTO submissions (submGUID, time, description, challGUID, acctGUID) VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?);',
        submGUID,
        textSub,
        challGUID,
        user!.acctGUID
    )
    await db.close()
    return {
        message: "Pending review..."
    }
}

export async function scoring(state : any, formData: FormData) {
    const user = await verifyAcct()
    if (user!.privLv < 5){
        redirect('/')
    }
    const challGUID = formData.get('challGUID')! as string

    if (!formData.has('submGUID')) {
        return {
            errors: "ERR: Challenge GUID missing."
        }
    }
    if (!formData.has('approval')) {
        return {
            errors: "ERR: No apprroval submitted."
        }
    }

    const db = await openDb()
    await db.run('UPDATE submissions SET feedback = ?, approval = ?, pts = ? WHERE submGUID = ?', 
        [formData.get('feedback'), formData.get('approval'),formData.get('points'),formData.get('submGUID')]
    )
    await db.close()
    revalidatePath('/teams')
    revalidatePath('/scoring')
}