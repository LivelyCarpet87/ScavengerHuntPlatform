'use client'
import { login } from '@/app/actions/login'
import Form from "next/form"
import { useActionState } from 'react'

export default function Login() {
    const [state, action, pending] = useActionState(login, undefined)
    return (
        <Form className="p-10 flex flex-col gap-2" action={action}>
            <p className="font-bold text-3xl">Login</p>
            <input name="acctName" placeholder='Team Name' className="p-1 w-64 border-3 border-blue-500 rounded"></input>
            <input name="passwd" placeholder='Password' type="password" className="p-1 w-64 border-3 border-blue-500 rounded"></input>
            {state?.errors && <p>{state.errors}</p>}
            <button type="submit" className="p-1 w-64 border-3 border-blue-500 bg-blue-300 rounded">Submit</button>
        </Form>
    )
}