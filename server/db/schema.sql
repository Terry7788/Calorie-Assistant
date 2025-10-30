-- Run this once to create the database and table if you prefer manual setup

IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = N'calorie_assistant')
BEGIN
  CREATE DATABASE calorie_assistant;
END
GO

USE calorie_assistant;
GO

IF NOT EXISTS (
    SELECT * FROM sys.objects 
    WHERE object_id = OBJECT_ID(N'[dbo].[Foods]') AND type in (N'U')
)
BEGIN
  CREATE TABLE [dbo].[Foods] (
    [id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [name] NVARCHAR(255) NOT NULL,
    [base_amount] DECIMAL(10,2) NOT NULL,
    [base_unit] NVARCHAR(50) NOT NULL,
    [calories] DECIMAL(10,2) NOT NULL,
    [protein] DECIMAL(10,2) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT DF_Foods_CreatedAt DEFAULT SYSDATETIME()
  );
END
GO


