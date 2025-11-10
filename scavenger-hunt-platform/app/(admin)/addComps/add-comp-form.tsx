'use client'

import { submitComp } from "@/app/actions/submitComp"
import Form from "next/form"
import { useActionState } from 'react'


export default function AddCompForm(){
    const [state, action, pending] = useActionState(submitComp, undefined)
    return (
    <div>
        <Form className="p-10 flex flex-col gap-2" action={action}>
            <p className="font-bold text-3xl">Add Competition</p>
            <input name="compName" placeholder='Competition Name' className="p-1 w-64 border-2 rounded"></input>
            <textarea name="compDesc" placeholder='Competition Description' className="p-1 w-64 h-32 border-2 rounded text-pretty text-start text-left"></textarea>
            <div className="flex flex-row justify-between w-64">
                <input name="maxPts" placeholder='Max' className="p-1 w-16 border-2 rounded"></input>
                <input name="minPts" placeholder='Min' className="p-1 w-16 border-2 rounded"></input>
                <input name="solveThresh" placeholder='Solve Limit' className="p-1 w-24 border-2 rounded"></input>
            </div>

            <label htmlFor="rankSystem">Choose a ranking system:</label>
            <select name="rankSystem" id="rankSystem" className="w-64 p-1 border-2 rounded">
                <option value="MAX">Largest Single Value</option>
                <option value="MAX_SUM">Largest Total Value</option>
                <option value="MIN">Smallest Single Value</option>
                <option value="FIRST">Fastest Submission</option>
            </select>

            <div className="flex flex-row justify-between w-64 flex-wrap items-center">
                <label htmlFor="unlocked">Unlocked</label>
                <input name="unlocked" id="unlocked" type="checkbox" defaultChecked={true} className="p-1 border-2 rounded mr-1"></input>
                <input name="unlockTime" placeholder='Unlock @ Time In UTC' className="p-1 w-64 border-2 rounded"></input>
            </div>
            <input type="file" name="file-submission" className="text-elipses border-2 p-1 rounded-sm w-64"></input>
            {state?.errors && <p>{state.errors}</p>}
            <button type="submit" className="p-1 w-64 border-2 border-blue-500 bg-blue-300 rounded">Submit</button>
        </Form>
    </div>
    )
}