'use client'

import { submitChall } from "@/app/actions/submitChall"
import Form from "next/form"
import { useActionState } from 'react'


export default function AddChallForm(){
    const [state, action, pending] = useActionState(submitChall, undefined)
    return (
    <div>
        <Form className="p-10 flex flex-col gap-2" action={action}>
            <p className="font-bold text-3xl">Add Challenge</p>
            <input name="challName" placeholder='Challenge Name' className="p-1 w-64 border-3 border-blue-500 rounded"></input>
            <textarea name="challDesc" placeholder='Challenge Description' className="p-1 w-64 h-32 border-3 border-blue-500 rounded text-pretty text-start text-left"></textarea>
            <div className="flex flex-row justify-between w-64">
                <input name="minPts" placeholder='Max' className="p-1 w-16 border-3 border-blue-500 rounded"></input>
                <input name="maxPts" placeholder='Min' className="p-1 w-16 border-3 border-blue-500 rounded"></input>
                <input name="solveThresh" placeholder='Thresh' className="p-1 w-16 border-3 border-blue-500 rounded"></input>
            </div>
            <div>
                <label htmlFor="unlocked">Unlocked</label>
                <input name="unlocked" id="unlocked" type="checkbox" defaultChecked={true} className="p-1 w-64 border-3 border-blue-500 rounded"></input>
                <input name="unlockTime" placeholder='Unlock @ Time In UTC' className="p-1 w-64 border-3 border-blue-500 rounded"></input>
            </div>
            <input type="file" name="file-submission" className="text-elipses border-2 p-1 rounded-sm w-64"></input>
            {state?.errors && <p>{state.errors}</p>}
            <button type="submit" className="p-1 w-64 border-3 border-blue-500 bg-blue-300 rounded">Submit</button>
        </Form>
    </div>
    )
}