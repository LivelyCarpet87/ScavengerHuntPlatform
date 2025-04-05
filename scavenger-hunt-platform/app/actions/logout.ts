'use server'
import { redirect } from 'next/navigation'
import {cookies} from 'next/headers'

export async function logout(formData: FormData) {
    const cookieStore = await cookies()
    cookieStore.delete('auth_token')
    
    redirect('/')
}