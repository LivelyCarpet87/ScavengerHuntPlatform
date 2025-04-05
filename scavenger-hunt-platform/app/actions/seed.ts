'use server'
import { openDb } from './db' 
import {v6 as uuidv6} from 'uuid'
import bcrypt from 'bcryptjs'
import { env } from 'process'

async function setup() {
  // Open SQLite connection
  const db = await openDb()

  // Define table schema
  await db.exec(`
    CREATE TABLE accounts (
      acctName TEXT,  
      acctGUID TEXT,
      passwdHash TEXT,
      priv INTEGER DEFAULT 0
    );
    CREATE TABLE submissions (
      submGUID TEXT,  
      time TEXT,
      description TEXT,
      acctGUID TEXT,
      pts INTEGER,
      feedback TEXT,
      approval INTEGER DEFAULT FALSE,
      challGUID TEXT
    );
    CREATE TABLE challenges (
      challGUID TEXT,  
      minPts INTEGER,
      maxPts INTEGER,
      solveThresh INTEGER,
      unlocked INTEGER,
      unlockTime INTEGER DEFAULT NULL,
      description TEXT
    );
    CREATE TABLE files (
      fileGUID TEXT,
      assocGUID TEXT,
      filename TEXT
    );
  `)

  let ADMIN_PASSWD = process.env.ADMIN_PASSWD || "PLEASE_NO"
  await db.run(
    'INSERT INTO accounts (acctName, acctGUID, passwdHash, priv) VALUES (?, ?, ?, ?);',
    'Administrator', 
    uuidv6(),
    bcrypt.hashSync(ADMIN_PASSWD),
    10
  )
  
  // Close connection
  await db.close()  
}

setup()
  .catch(err => {
    console.error(err.message)
  }) 