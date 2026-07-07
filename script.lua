-- LocalScript (colocar em StarterPlayerScripts ou executar via executor)

local Players = game:GetService("Players")
local player = Players.LocalPlayer

-- Variáveis de controle
local autoResetEnabled = false
local resetInterval = 10 -- valor padrão em segundos

-- ================= GUI =================
local ScreenGui = Instance.new("ScreenGui")
ScreenGui.Name = "AutoResetHub"
ScreenGui.ResetOnSpawn = false
ScreenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
ScreenGui.Parent = player:WaitForChild("PlayerGui")

-- Frame principal (arrastável)
local MainFrame = Instance.new("Frame")
MainFrame.Name = "MainFrame"
MainFrame.Size = UDim2.new(0, 220, 0, 180)
MainFrame.Position = UDim2.new(0.5, -110, 0.3, 0)
MainFrame.BackgroundColor3 = Color3.fromRGB(25, 25, 30)
MainFrame.BorderSizePixel = 0
MainFrame.Active = true
MainFrame.Draggable = true -- funciona em mobile também
MainFrame.Parent = ScreenGui

local UICorner = Instance.new("UICorner")
UICorner.CornerRadius = UDim.new(0, 12)
UICorner.Parent = MainFrame

local UIStroke = Instance.new("UIStroke")
UIStroke.Color = Color3.fromRGB(80, 80, 90)
UIStroke.Thickness = 1.5
UIStroke.Parent = MainFrame

-- Título
local Title = Instance.new("TextLabel")
Title.Size = UDim2.new(1, 0, 0, 35)
Title.BackgroundColor3 = Color3.fromRGB(35, 35, 42)
Title.BackgroundTransparency = 0
Title.Text = "⏱ Auto Reset Hub"
Title.TextColor3 = Color3.fromRGB(255, 255, 255)
Title.Font = Enum.Font.GothamBold
Title.TextSize = 16
Title.Parent = MainFrame

local TitleCorner = Instance.new("UICorner")
TitleCorner.CornerRadius = UDim.new(0, 12)
TitleCorner.Parent = Title

-- Label do input
local InputLabel = Instance.new("TextLabel")
InputLabel.Size = UDim2.new(1, -20, 0, 20)
InputLabel.Position = UDim2.new(0, 10, 0, 45)
InputLabel.BackgroundTransparency = 1
InputLabel.Text = "Segundos para reset:"
InputLabel.TextColor3 = Color3.fromRGB(200, 200, 200)
InputLabel.Font = Enum.Font.Gotham
InputLabel.TextSize = 13
InputLabel.TextXAlignment = Enum.TextXAlignment.Left
InputLabel.Parent = MainFrame

-- Caixa de texto (input)
local InputBox = Instance.new("TextBox")
InputBox.Size = UDim2.new(1, -20, 0, 35)
InputBox.Position = UDim2.new(0, 10, 0, 68)
InputBox.BackgroundColor3 = Color3.fromRGB(45, 45, 52)
InputBox.TextColor3 = Color3.fromRGB(255, 255, 255)
InputBox.PlaceholderText = "Digite os segundos (ex: 10)"
InputBox.PlaceholderColor3 = Color3.fromRGB(140, 140, 140)
InputBox.Text = ""
InputBox.Font = Enum.Font.Gotham
InputBox.TextSize = 14
InputBox.ClearTextOnFocus = false
InputBox.Parent = MainFrame

local InputCorner = Instance.new("UICorner")
InputCorner.CornerRadius = UDim.new(0, 8)
InputCorner.Parent = InputBox

-- Botão Ativar/Desativar
local ToggleButton = Instance.new("TextButton")
ToggleButton.Size = UDim2.new(1, -20, 0, 35)
ToggleButton.Position = UDim2.new(0, 10, 0, 112)
ToggleButton.BackgroundColor3 = Color3.fromRGB(60, 160, 90)
ToggleButton.Text = "ATIVAR AUTO RESET"
ToggleButton.TextColor3 = Color3.fromRGB(255, 255, 255)
ToggleButton.Font = Enum.Font.GothamBold
ToggleButton.TextSize = 13
ToggleButton.AutoButtonColor = true
ToggleButton.Parent = MainFrame

local ToggleCorner = Instance.new("UICorner")
ToggleCorner.CornerRadius = UDim.new(0, 8)
ToggleCorner.Parent = ToggleButton

-- Label de contagem regressiva
local CountdownLabel = Instance.new("TextLabel")
CountdownLabel.Size = UDim2.new(1, -20, 0, 20)
CountdownLabel.Position = UDim2.new(0, 10, 0, 152)
CountdownLabel.BackgroundTransparency = 1
CountdownLabel.Text = "Status: Desativado"
CountdownLabel.TextColor3 = Color3.fromRGB(180, 180, 180)
CountdownLabel.Font = Enum.Font.Gotham
CountdownLabel.TextSize = 12
CountdownLabel.Parent = MainFrame

-- ================= FUNÇÕES =================

local function killCharacter()
	local character = player.Character
	if character then
		local humanoid = character:FindFirstChildOfClass("Humanoid")
		if humanoid then
			humanoid.Health = 0
		end
	end
end

local function startAutoReset()
	task.spawn(function()
		while autoResetEnabled do
			local timeLeft = resetInterval

			while timeLeft > 0 and autoResetEnabled do
				CountdownLabel.Text = "Reset em: " .. timeLeft .. "s"
				task.wait(1)
				timeLeft -= 1
			end

			if autoResetEnabled then
				killCharacter()
				task.wait(0.5) -- pequena pausa para o personagem respawnar antes de reiniciar a contagem
			end
		end
		CountdownLabel.Text = "Status: Desativado"
	end)
end

-- Ao clicar no botão de ativar/desativar
ToggleButton.MouseButton1Click:Connect(function()
	if not autoResetEnabled then
		-- Tenta pegar o valor digitado
		local inputValue = tonumber(InputBox.Text)
		if inputValue and inputValue > 0 then
			resetInterval = inputValue
		end

		autoResetEnabled = true
		ToggleButton.Text = "DESATIVAR AUTO RESET"
		ToggleButton.BackgroundColor3 = Color3.fromRGB(180, 60, 60)
		startAutoReset()
	else
		autoResetEnabled = false
		ToggleButton.Text = "ATIVAR AUTO RESET"
		ToggleButton.BackgroundColor3 = Color3.fromRGB(60, 160, 90)
		CountdownLabel.Text = "Status: Desativado"
	end
end)

-- Suporte extra para mobile (garantir toque funcione bem)
InputBox.FocusLost:Connect(function(enterPressed)
	local inputValue = tonumber(InputBox.Text)
	if inputValue and inputValue > 0 then
		resetInterval = inputValue
	end
end)
