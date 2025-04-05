'use client'
import { register } from '@/app/actions/register'
import Form from "next/form"
import { useActionState } from 'react'

export default function Register() {
    const [state, action, pending] = useActionState(register, undefined)
    return (
        <Form className="p-10 flex flex-col gap-2" action={action}>
            <p className="font-bold text-3xl">Register</p>
            <input name="acctName" placeholder='Team Name' className="p-1 w-64 border-3 border-blue-500 rounded"></input>
            {state?.errors?.name && <p>{state.errors.name}</p>}
            <input name="passwd" placeholder='Password' type="password" className="p-1 w-64 border-3 border-blue-500 rounded"></input>
            {state?.errors?.passwd && <p>{state.errors.passwd}</p>}
            <input name="key" placeholder='Key' className="p-1 w-64 border-3 border-blue-500 rounded"></input>
            {state?.errors?.key && <p>{state.errors.key}</p>}
            <button type="submit" className="p-1 w-64 border-3 border-blue-500 bg-blue-300 rounded">Submit</button>
        </Form>
    )
}