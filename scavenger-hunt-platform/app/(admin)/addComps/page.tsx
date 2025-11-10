'use server'
import { verifyAcct } from "@/app/lib/verifyAcct"
import { redirect } from "next/navigation"
import AddCompForm from "./add-comp-form"

export default async function AddComp(){
    const user = await verifyAcct()
    if (user!.privLv < 5){
        redirect('/')
    }
    return (
        <AddCompForm></AddCompForm>
    )
}