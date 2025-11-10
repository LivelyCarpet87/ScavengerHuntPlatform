'use server'
import { openDb } from '@/app/actions/db' 
import {v6 as uuidv6} from 'uuid'
import { redirect } from 'next/navigation'
import {cookies} from 'next/headers'
import { verifyAcct } from '../lib/verifyAcct'
import fs from 'fs'

export async function submitComp(state : any, formData: FormData) {
    const user = await verifyAcct()
    if (user!.privLv < 5){
        redirect('/')
    }

    if (!formData.has('compDesc') || !formData.has('file-submission')) {
        return {
            errors: "ERR: No content submitted."
        }
    }
    const description = (formData.get('compDesc') as string)
    const fileSub = (formData.get('file-submission') as File)
    if (description.length == 0 && fileSub.size == 0 ) {
        return {
            errors: "ERR: No content submitted."
        }
    }
    if (fileSub.size > 10**9){
        return {
            errors: "ERR: File too large."
        }
    }

    const compName = (formData.get('compName') as string)
    if (compName.length == 0){
        return {
            errors: "ERR: Empty name."
        }
    }

    let unlockTime: string | null = (formData.get('unlockTime') as string)
    const unlocked = (formData.get('unlocked') as string) == "on" ? 1 : 0
    if (unlocked || unlockTime.length == 0) {
        unlockTime = null
    }

    const minPts = (formData.get('minPts') as string)
    const maxPts = (formData.get('maxPts') as string)
    const solveThresh = (formData.get('solveThresh') as string)
    const rankSystem = (formData.get('rankSystem') as string)

    const db = await openDb()

    const compGUID = uuidv6()
    if (fileSub.size > 0){
        const fileGUID = uuidv6()
        const filepath = './uploads/'+fileGUID+ (/.*(\.[A-Za-z0-9]+)/gm.exec(fileSub.name))![1]
        fs.writeFileSync(
            filepath,
            Buffer.from(await fileSub.arrayBuffer())
        )
        await db.run(
            'INSERT INTO files (fileGUID, assocGUID, filename) VALUES (?, ?, ?);',
            fileGUID, 
            compGUID,
            fileSub.name
        )
    }

    await db.run(
        'INSERT INTO competitions (compGUID, compName, description, minPts, maxPts, solveThresh, unlocked, unlockTime, rankSystem) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);',
        compGUID,
        compName,
        description,
        minPts,
        maxPts,
        solveThresh,
        unlocked,
        unlockTime,
        rankSystem
    )
    await db.close()

}
