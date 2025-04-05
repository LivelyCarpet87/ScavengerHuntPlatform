'use server'
import { verifyAcct } from "@/app/lib/verifyAcct"
import { redirect } from "next/navigation"
import AddChallForm from "./add-chall-form"

export default async function AddChall(){
    const user = await verifyAcct()
    if (user!.privLv < 5){
        redirect('/')
    }
    return (
        <AddChallForm></AddChallForm>
    )
}